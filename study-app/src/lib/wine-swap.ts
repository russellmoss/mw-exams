// wine-swap.ts — repairing a banked question by replacing one wine, not by throwing it away.
//
// A ruling that lands invalidates banked questions. The obvious response — quarantine them and
// regenerate — is the wrong one twice over: it discards a validated answer key, a model answer and a
// stem that may be excellent, over ONE wine; and this project deleted bulk generation for cost
// reasons, so "regenerate the affected dozen" is exactly the spend that decision was about.
//
// So a repair is surgical. Keep every wine the ruling did not touch, choose a replacement that fixes
// the flight, and rebuild the question around the corrected list using the engine's PINNED mode — the
// same mechanism Live Tasting uses to write a question around wines a shop actually has.
//
// THE GATE IS THE VALIDATOR, AND IT IS NOT NEGOTIABLE. A rebuilt question replaces the original only
// if validateQuestion() returns zero hard violations. Anything less and NOTHING changes: the original
// stands, the attempt is recorded as failed with its verdict attached, and the question waits for a
// human. A repair loop that could half-fix a question would be worse than no repair loop, because the
// result would look repaired.
//
// COST. Each repair is one pinned generation plus its key and model answer. That is real money, which
// is why nothing here runs on a schedule or as a side effect: repairs are dispatched by an admin from
// a previewed, capped batch, and every attempt writes its cost to question_repairs.

import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion, validatePaperScope } from "@/lib/question-engine";
// The SAME per-wine style classifier the Paper 3 sampler, Exam Mix and the validator's style-mix rule
// use. A replacement must be the style the flight is built on, and this is where that is decided
// everywhere else in the system.
import { classifyWineStyle } from "@/lib/p3-category.mjs";
import {
  validateQuestion,
  isBanker,
  type AuditWine,
} from "@/lib/question-validator";
import { carryReviewsForward } from "@/lib/question-review";
import { sweepRoleViolations, type SweepHit } from "@/lib/role-sweep";
import "@/lib/appellation-resolver";

/** How many repairs one dispatched batch may attempt, whatever the caller asks for. */
export const MAX_REPAIR_BATCH = 10;

/**
 * A question that has been repaired this many times and is still being rejected is not converging.
 *
 * Two is not a guess about model competence — it is the point at which the evidence says the problem
 * is the FLIGHT, not the wine that was swapped. Continuing past it spends a generation call per
 * attempt and, worse, spends a reviewer's attention on the same question a third time, which is the
 * scarce resource here (the bank has ~370 servable questions and 33 have ever been reviewed).
 */
export const MAX_REPAIRS_PER_QUESTION = 2;

interface BankRow {
  id: string;
  producer: string;
  wine_name: string;
  country: string;
  region: string;
  grape_varieties: unknown;
  style_category: string | null;
  colour: string | null;
}

const norm = (s: string | null | undefined) => (s || "").toLowerCase().trim();

function grapeList(r: BankRow): string[] {
  const g = typeof r.grape_varieties === "string" ? JSON.parse(r.grape_varieties) : r.grape_varieties;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === "string") : [];
}

/** The wine reference as the generator must reproduce it verbatim. Same shape as Live Tasting's. */
function pinnedText(r: BankRow): string {
  const name = (r.wine_name || "").trim();
  const head = name ? `${r.producer.trim()}, ${name}` : r.producer.trim();
  return `${head}. ${r.region.trim()}, ${r.country.trim()}.`;
}

function usable(r: BankRow): boolean {
  return Boolean(r.producer?.trim().length > 2 && r.country?.trim() && r.region?.trim());
}

function asAuditWine(r: BankRow, slot: number): AuditWine {
  return {
    slot,
    varieties: grapeList(r),
    region: r.region,
    country: r.country,
    fullText: pinnedText(r),
  } as AuditWine;
}

export interface ReplacementCandidate {
  bankId: string;
  fullText: string;
  region: string;
  country: string;
  varieties: string[];
  /** Why this one — surfaced in the admin preview so the choice can be overruled before it is paid for. */
  why: string;
}

/**
 * Find bankers that could stand in for the departing wine.
 *
 * The constraint set is derived from the flight, not from taste:
 *  · it must be a BANKER under the current calibration — that is the entire point of the repair;
 *  · it must not duplicate a wine already in the flight;
 *  · where the stem asserts a shared variety, it must share that variety, or the swap fixes the
 *    composition by breaking the stem, which the validator would then reject anyway;
 *  · where the stem asserts a shared country, likewise.
 *
 * Ordered by how much of the flight's existing shape it preserves. The caller shows the top few to an
 * admin rather than committing to the first: a plausible-looking replacement that a wine person would
 * never pour is exactly the failure a preview exists to catch.
 */
export async function findReplacements(opts: {
  departing: AuditWine;
  flight: AuditWine[];
  stem: string;
  paper: number;
  limit?: number;
}): Promise<ReplacementCandidate[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, producer, wine_name, country, region, grape_varieties, style_category, colour
    FROM wine_bank
  `) as unknown as BankRow[];

  const stem = opts.stem.toLowerCase();
  const sameVariety = /\bsame single grape variety\b/.test(stem);
  const sameCountry = /\b(?:the )?same country\b/.test(stem);
  const sameRegion = /\b(?:the )?same region\b/.test(stem);

  // What the surviving wines have in common is what the replacement must also have. Taken from the
  // FLIGHT rather than from the departing wine: the departing wine is the one we have decided is
  // wrong, so inheriting its properties is how a repair reproduces the fault it is fixing.
  const survivors = opts.flight.filter((w) => w.slot !== opts.departing.slot);
  const survivorVarieties = new Set(
    survivors.flatMap((w) => (w.varieties || []).map(norm)).filter(Boolean)
  );
  const survivorCountries = new Set(survivors.map((w) => norm(w.country)).filter(Boolean));
  const survivorRegions = new Set(survivors.map((w) => norm(w.region)).filter(Boolean));
  const inFlight = new Set(
    opts.flight.map((w) => norm(w.fullText)).filter(Boolean)
  );

  // WHAT IS ACTUALLY IN THE GLASS — the constraint every rule above is blind to.
  //
  // Every filter so far is about geography and grape. None of them knows a colour or a style, and the
  // first run of this picker proved how badly that fails: it offered a BAROLO into "Wines 1 to 4 are
  // all dry white wines", and a sparkling Brut Rosé into a still Pinot Noir flight. Both scored well.
  // Both would have been rebuilt, paid for, and then rejected by the validator.
  //
  // Style comes from classifyWineStyle — the same classifier the Paper 3 sampler, Exam Mix and the
  // validator's own style-mix rule use, run on the label text, so no bank lookup can go stale or miss.
  // It returns `{ style, isRose }`, NOT a string: comparing the objects with !== compares identities,
  // is always true, and silently rejects every candidate in the bank.
  const departingStyle = classifyWineStyle(opts.departing.fullText ?? "");

  // Papers 1 and 2 are STILL wines. Within that, "other" (still dry) and "oxidative" are both legal
  // and are frequently the point — the flight this was first measured against says in its own stem
  // that the wines were "made using a range of different winemaking approaches", so demanding exact
  // style identity there would rule out the contrast the question exists to test. Paper 3 is the
  // opposite: its flights are BUILT on a style axis, so the style has to match exactly.
  const STILL_STYLES = new Set(["other", "oxidative"]);
  const styleMatches = (candidate: ReturnType<typeof classifyWineStyle>): boolean => {
    // A rosé is not a substitute for a white or a red in any paper, and vice versa.
    if (candidate.isRose !== departingStyle.isRose) return false;
    if (opts.paper === 3) return candidate.style === departingStyle.style;
    return STILL_STYLES.has(candidate.style) && STILL_STYLES.has(departingStyle.style);
  };

  const scored: { c: ReplacementCandidate; score: number }[] = [];
  for (const r of rows) {
    if (!usable(r)) continue;
    const text = pinnedText(r);
    if (inFlight.has(norm(text))) continue;

    // Paper scope first — the cheapest and most absolute filter, and not a judgement call: a red in
    // Paper 1 is an invalid question, and the validator would say so only after we had paid to rebuild
    // it. Papers 1 and 2 fix the colour; Paper 3's scope is flight-level and handled by the style gate.
    if (opts.paper === 1 || opts.paper === 2) {
      const probe = `${text} ${grapeList(r).join(", ")}`;
      if (!validatePaperScope(opts.paper, [{ slot: 1, fullText: probe }]).valid) continue;
    }

    // Style must match. still / sparkling / fortified / sweet is the axis a flight is BUILT on —
    // especially in Paper 3 — and swapping across it destroys the question's premise however well the
    // geography lines up.
    if (!styleMatches(classifyWineStyle(text))) continue;

    const wine = asAuditWine(r, opts.departing.slot);
    if (!isBanker(wine)) continue;

    const grapes = grapeList(r).map(norm);
    if (sameVariety && survivorVarieties.size > 0) {
      if (!grapes.some((g) => survivorVarieties.has(g))) continue;
    }
    if (sameCountry && survivorCountries.size > 0) {
      if (!survivorCountries.has(norm(r.country))) continue;
    }
    if (sameRegion && survivorRegions.size > 0) {
      if (!survivorRegions.has(norm(r.region))) continue;
    }

    // Prefer a replacement that keeps the flight's breadth: a NEW country scores above one that
    // duplicates a country already present, unless the stem pins the country.
    let score = 0;
    const why: string[] = ["reads as a banker under the current calibration"];
    const sameAsDeparting = norm(r.country) === norm(opts.departing.country);
    if (sameAsDeparting) {
      score += 1;
      why.push("same country as the wine it replaces, so the stem's geography still holds");
    } else if (!sameCountry && !survivorCountries.has(norm(r.country))) {
      // `else if`, not a second `if`. survivorCountries excludes the departing wine, so a replacement
      // from the departing wine's OWN country satisfies both clauses and the reason read as a
      // self-contradiction — "adds a country the flight does not already have; same country as the
      // wine it replaces". Both were technically true of the post-swap flight and the pair was useless
      // to the admin who has to approve the spend.
      score += 2;
      why.push("adds a country the flight does not already have");
    }
    if (sameVariety && grapes.some((g) => survivorVarieties.has(g))) {
      score += 3;
      why.push("shares the flight's stated variety");
    }

    scored.push({
      c: {
        bankId: r.id,
        fullText: text,
        region: r.region,
        country: r.country,
        varieties: grapeList(r),
        why: why.join("; "),
      },
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(10, opts.limit ?? 5))).map((s) => s.c);
}

export interface RepairOutcome {
  questionId: string;
  status: "applied" | "failed" | "skipped";
  slot: number;
  wineBefore: string | null;
  wineAfter: string | null;
  /** The new question's id when a repair applied — the original is retired, not edited in place. */
  newQuestionId?: string;
  hard?: { rule: string; detail: string }[];
  error?: string;
  resurfacedTo?: number;
}

/**
 * Repair one question: swap the named slot, rebuild, gate, and (on success) resurface for review.
 *
 * The rebuilt question is a NEW row and the original is retired rather than edited in place. Three
 * reasons, all of them about not lying to someone downstream: attempts, feedback and rulings already
 * reference the old question_id and must keep pointing at the wines they were actually about; the old
 * stem is the evidence for why the reviewer rejected it; and an edit-in-place with a half-written key
 * would be servable in the window between the two writes.
 */
export async function repairQuestion(opts: {
  hit: SweepHit;
  slot: number;
  replacement: ReplacementCandidate;
  apiKey: string;
  userId: number | null;
  repairId?: number | null;
  onBackgroundWork?: (work: Promise<unknown>) => void;
}): Promise<RepairOutcome> {
  const sql = neon(process.env.DATABASE_URL!);
  const { hit, slot, replacement } = opts;
  const before = hit.wines.find((w) => w.slot === slot)?.label ?? null;

  const base: RepairOutcome = {
    questionId: hit.questionId,
    status: "failed",
    slot,
    wineBefore: before,
    wineAfter: replacement.fullText,
  };

  /**
   * Close the ledger row on EVERY terminal outcome, not only the ones that reach the validator gate.
   *
   * The first version wrote question_repairs only after a successful generation, so a generation that
   * ERRORED — which is the common failure, not the rare one — returned early and left the row at
   * 'queued'. Measured on the branch: repair 23 failed on a colour-resolution error, reported the
   * failure to the caller, and left a queued row that the next batch would pick up and pay to run
   * again. Indefinitely, since the cause was a surviving wine the swap never touches.
   */
  const closeRow = async (status: "failed" | "skipped", message: string, verdict?: unknown) => {
    if (!opts.repairId) return;
    await sql`
      UPDATE question_repairs
      SET status = ${status},
          wine_after = ${replacement.fullText},
          error_message = ${message.slice(0, 1000)},
          verdict = ${verdict ? JSON.stringify(verdict) : null}::jsonb,
          updated_at = NOW()
      WHERE id = ${opts.repairId}
    `;
  };

  const guard = await sql`
    SELECT repair_count, paper, family FROM generated_questions WHERE question_id = ${hit.questionId}
  `;
  if (!guard[0]) {
    await closeRow("failed", "question not found");
    return { ...base, error: "question not found" };
  }
  if (Number(guard[0].repair_count ?? 0) >= MAX_REPAIRS_PER_QUESTION) {
    const msg =
      `Already repaired ${MAX_REPAIRS_PER_QUESTION} times and still failing — the problem is the ` +
      `flight, not the wine. Needs a human.`;
    await closeRow("skipped", msg);
    return { ...base, status: "skipped", error: msg };
  }

  // The corrected flight: every surviving wine verbatim, the replacement in the vacated slot.
  const pinnedWines = hit.wines.map((w) =>
    w.slot === slot
      ? { slot, fullText: replacement.fullText }
      : { slot: w.slot, fullText: w.label }
  );
  // A blank reference would be pinned as an empty wine and the generator would invent one to fill the
  // slot — a repair that silently changes a wine nobody ruled on. Bail before spending the call.
  const blank = pinnedWines.find((w) => !w.fullText.trim());
  if (blank) {
    const msg = `wine ${blank.slot} has no stored label, so the flight cannot be pinned`;
    await closeRow("failed", msg);
    return { ...base, error: msg };
  }

  let newQuestionId: string | null = null;
  try {
    const result = await generateFreshQuestion(
      Number(guard[0].paper),
      String(guard[0].family),
      opts.apiKey,
      { source: "server", userId: opts.userId ?? null },
      undefined,
      undefined, // no emit — a streamed call escapes the SDK timeout cap (see live-tasting-engine)
      {
        // scope 'pool', NOT 'live-tasting'. The distinction is load-bearing: question-audit.ts stands
        // the bank-composition rules down for live-tasting scope, and those rules — flight-composition
        // above all — are the exact ones this repair exists to satisfy. A repair audited under the
        // live-tasting exemption would be waved through without checking the thing it fixed.
        scope: "pool",
        pinnedWines,
        status: "approved",
        awaitKeyOnly: true,
        onBackgroundWork: opts.onBackgroundWork,
        budgetMs: 190_000,
        callTimeoutMs: 95_000,
      }
    );
    if ("error" in result && result.error) {
      // The pinned generator's own message says "Live Tasting generation did not converge" whatever
      // the caller — it is the shared pinned path. Left verbatim but prefixed, because the admin
      // reading this needs to know it was a BANK REPAIR that failed, and the rest of the sentence is
      // the actual diagnosis (measured: a surviving wine whose colour could not be resolved, which no
      // amount of swapping the OTHER slot will ever fix).
      const msg = `Rebuild failed — ${result.error}`;
      await closeRow("failed", msg);
      return { ...base, error: msg };
    }
    if (!("question" in result) || !result.question) {
      await closeRow("failed", "generation returned nothing");
      return { ...base, error: "generation returned nothing" };
    }
    newQuestionId = result.question.question_id as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generation threw";
    await closeRow("failed", msg);
    return { ...base, error: msg };
  }

  // ── The gate ────────────────────────────────────────────────────────────────────────────────────
  //
  // Re-sweep the NEW question through the same validator the sweep used. Not a subset, not a
  // reimplementation: if it still carries a hard role violation, or the key never landed, the repair
  // did not work.
  const { hits: stillBroken } = await sweepRoleViolations({ questionIds: [newQuestionId] });
  const keyed = await sql`
    SELECT validated FROM stem_answer_keys WHERE question_id = ${newQuestionId}
  `;
  const full = await sql`
    SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, g.model_answer,
           k.ground_truth
    FROM generated_questions g
    LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
    WHERE g.question_id = ${newQuestionId}
  `;
  const hardFromValidator = (() => {
    const r = full[0];
    if (!r || !r.ground_truth) return [{ rule: "no-answer-key", detail: "the rebuilt question produced no validated answer key" }];
    const gt = (typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth) as AuditWine[];
    const raw = (typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines) as { slot: number; fullText?: string }[];
    const bySlot = new Map((raw || []).map((w) => [w.slot, w.fullText ?? ""]));
    const wines = (gt || []).map((w) => ({ ...w, ...(bySlot.has(w.slot) ? { fullText: bySlot.get(w.slot) } : {}) }));
    const res = validateQuestion({
      questionId: String(r.question_id),
      paper: Number(r.paper),
      family: String(r.family),
      questionText: String(r.question_text),
      totalMarks: Number(r.total_marks),
      wines,
      modelAnswer: (r.model_answer as string) ?? null,
    });
    return res.violations
      .filter((v) => v.severity === "hard")
      .map((v) => ({ rule: v.rule, detail: v.detail }));
  })();

  const hard = [
    ...hardFromValidator,
    ...stillBroken.flatMap((h) => h.violations.map((v) => ({ rule: v.rule, detail: v.detail }))),
  ];
  const keyInvalid = keyed[0]?.validated === false;

  if (hard.length > 0 || keyInvalid) {
    // Retire the failed rebuild so it can never be served, and leave the ORIGINAL exactly as it was.
    // A failed repair must change nothing: the reviewer's complaint stands, unrepaired and visible,
    // rather than being replaced by a second question with the same fault and a fresh id.
    await sql`
      UPDATE generated_questions
      SET is_retired = true,
          invalid_reasons = ${JSON.stringify(hard.map((h) => ({ ...h, severity: "hard" })))}::jsonb
      WHERE question_id = ${newQuestionId}
    `;
    await closeRow(
      "failed",
      keyInvalid ? "answer key failed validation" : "rebuilt question still carries hard violations",
      hard
    );
    return { ...base, status: "failed", hard, newQuestionId };
  }

  // ── Applied ─────────────────────────────────────────────────────────────────────────────────────
  const note =
    `Wine ${slot} replaced: ${before ?? "(unknown)"} → ${replacement.fullText}. ` +
    `Reason: ${hit.violations.map((v) => v.rule).join(", ")}.`;

  await sql`
    UPDATE generated_questions
    SET repair_count = ${Number(guard[0].repair_count ?? 0) + 1},
        last_repaired_at = NOW(),
        last_repair_note = ${note}
    WHERE question_id = ${newQuestionId}
  `;
  // Retire the original. Not deleted: attempts, feedback rows and rulings reference it, and they are
  // about the wines it actually had.
  await sql`
    UPDATE generated_questions
    SET is_retired = true,
        last_repair_note = ${`Superseded by ${newQuestionId} — ${note}`}
    WHERE question_id = ${hit.questionId}
  `;

  // Back to BOTH reviewers — automatically, because the rebuilt question is a new id with no votes
  // against it and therefore appears in both queues. What needs doing explicitly is the LINK: carry
  // the predecessor's votes across as superseded rows so the reviewer who rejected the old version
  // can see that this card is the answer to their complaint, and so the audit trail runs from the
  // rebuilt question back to the judgement that caused it. The originals stay live on the retired
  // row, so nobody's completed count drops for work they actually did.
  const resurfacedTo = await carryReviewsForward(
    hit.questionId,
    newQuestionId,
    `Superseded by a repair: ${note}`
  );

  if (opts.repairId) {
    await sql`
      UPDATE question_repairs
      SET status = 'applied', wine_after = ${replacement.fullText}, updated_at = NOW()
      WHERE id = ${opts.repairId}
    `;
  }

  return {
    ...base,
    status: "applied",
    newQuestionId,
    resurfacedTo,
  };
}

/**
 * Run a capped batch of queued repairs.
 *
 * Sequential, not parallel. Each repair is a full generation with a 190s budget, and firing ten at
 * once would blow every serverless ceiling this codebase has already been bitten by — plus the cap
 * exists to make the spend legible, which it stops being if ten calls are in flight before anyone can
 * look at the first result.
 */
export async function runRepairBatch(opts: {
  repairIds: number[];
  apiKey: string;
  userId: number | null;
  onBackgroundWork?: (work: Promise<unknown>) => void;
}): Promise<{ outcomes: RepairOutcome[]; capped: boolean }> {
  const sql = neon(process.env.DATABASE_URL!);
  const capped = opts.repairIds.length > MAX_REPAIR_BATCH;
  const ids = opts.repairIds.slice(0, MAX_REPAIR_BATCH);

  const rows = (await sql`
    SELECT id, question_id, slot FROM question_repairs
    WHERE id = ANY(${ids}) AND status = 'queued'
  `) as { id: number; question_id: string; slot: number }[];

  const outcomes: RepairOutcome[] = [];
  for (const row of rows) {
    const { hits } = await sweepRoleViolations({ questionIds: [row.question_id] });
    const hit = hits[0];
    if (!hit) {
      // The question is no longer failing — an earlier repair in this same batch, or a ruling that
      // has since been reversed, already fixed it. Close the row rather than paying to rebuild a
      // question that is now fine.
      await sql`
        UPDATE question_repairs
        SET status = 'skipped', error_message = 'no longer failing at run time', updated_at = NOW()
        WHERE id = ${row.id}
      `;
      outcomes.push({
        questionId: row.question_id,
        status: "skipped",
        slot: row.slot,
        wineBefore: null,
        wineAfter: null,
        error: "no longer failing",
      });
      continue;
    }

    const slot = hit.suggestedSlot ?? row.slot;
    const departing = hit.wines.find((w) => w.slot === slot);
    if (!departing) {
      await sql`
        UPDATE question_repairs SET status = 'failed',
          error_message = 'no swappable slot could be identified', updated_at = NOW()
        WHERE id = ${row.id}`;
      outcomes.push({
        questionId: row.question_id, status: "failed", slot,
        wineBefore: null, wineAfter: null, error: "no swappable slot",
      });
      continue;
    }

    const flight: AuditWine[] = hit.wines.map((w) => ({
      slot: w.slot,
      varieties: w.variety ? w.variety.split(" / ") : [],
      region: w.region ?? "",
      country: w.country ?? "",
      fullText: w.label,
    }) as AuditWine);

    const candidates = await findReplacements({
      departing: flight.find((w) => w.slot === slot)!,
      flight,
      stem: hit.stem,
      paper: hit.paper,
    });
    if (candidates.length === 0) {
      // This is the most informative failure the loop produces: the corrected calibration has left
      // this flight with no legal composition available from the bank. Say exactly that rather than
      // retrying, which would fail identically and cost a generation call each time.
      await sql`
        UPDATE question_repairs SET status = 'failed',
          error_message = 'no banker in the wine bank satisfies this flight''s constraints — needs a new wine, or a human',
          updated_at = NOW()
        WHERE id = ${row.id}`;
      outcomes.push({
        questionId: row.question_id, status: "failed", slot,
        wineBefore: departing.label, wineAfter: null,
        error: "no compatible banker available",
      });
      continue;
    }

    outcomes.push(
      await repairQuestion({
        hit,
        slot,
        replacement: candidates[0],
        apiKey: opts.apiKey,
        userId: opts.userId,
        repairId: row.id,
        onBackgroundWork: opts.onBackgroundWork,
      })
    );
  }

  return { outcomes, capped };
}
