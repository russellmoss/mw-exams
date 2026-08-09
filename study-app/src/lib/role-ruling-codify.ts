// role-ruling-codify.ts — carrying an upheld role ruling into data/banker_signals.json.
//
// An upheld ruling is a decision that has not yet changed anything. This module is what makes it real:
// it writes a build brief naming the exact JSON edit, fires the SAME auto-feedback Action the feedback
// and bin-fix pipelines use, and records the PR against the rulings it carries.
//
// THREE DELIBERATE CHOICES:
//
// 1. ALWAYS PR-GATED, NEVER AUTO-MERGED. This edit changes the calibration every future flight is
//    built against AND retroactively invalidates banked questions that were passing under the old
//    table. It is the highest-blast-radius change this system can make from a single click, and the
//    project's own rule (GEN/VALIDATOR paths are reviewOnly) already says a human reads it.
//
// 2. RULINGS ARE CODIFIED AS A BATCH, IN ONE PR. Partly deploy quota — the Hobby plan allows 100
//    deployments a rolling 24h and a PR per ruling would burn them — but mostly review quality. Two
//    rulings from one review pass can contradict each other (one asking to widen a signal, one asking
//    to narrow it), and that is only visible when they are read together. This is the same lesson the
//    bin-fix proposals taught: review as a set, never individually.
//
// 3. THE BRIEF CARRIES THE EXACT SCHEMA AND THE EXACT ENTRIES. The Action's agent should be
//    transcribing a decision, not making one. Everything that can be decided here — the signal id,
//    the source stamp, which entries to touch — is decided here; the only judgement left to the agent
//    is the regex itself, which needs wine knowledge to write and cannot be mechanically derived from
//    a single bottle's label.

import { neon } from "@neondatabase/serverless";
import { dispatchRepositoryEvent } from "@/lib/github-dispatch";
import { VALIDATOR_PATHS } from "@/lib/apply-change";
import { bankerSignalTable, describePattern } from "@/lib/banker-signals";
import { corpusEvidenceFor, renderCorpusEvidence } from "@/lib/prompts/role-adjudication";
import { getRoleRulings, type RoleRuling } from "@/lib/wine-role-rulings";

function db() {
  return neon(process.env.DATABASE_URL!);
}

/** The upheld rulings that have not yet been carried into the table. */
export async function getCodifiableRulings(limit = 25): Promise<RoleRuling[]> {
  return (await getRoleRulings({ verdict: "upheld", uncodifiedOnly: true, limit })).filter(
    (r) => r.proposedEdit && r.proposedEdit !== "none"
  );
}

/**
 * Contradiction check, run BEFORE anything is dispatched.
 *
 * Two upheld rulings can pull the same signal in opposite directions — one asking to narrow
 * `fr-alsace-noble` because a wine under it is a curveball, another asking to widen it because a wine
 * outside it is a banker. Shipping both in one PR produces an edit whose net effect nobody decided.
 *
 * This does NOT block the batch: it names the collisions so they appear at the top of the PR body and
 * in the admin UI, where a human decides. A machine cannot tell a genuine contradiction from two
 * compatible refinements of the same entry, and guessing would be worse than saying so.
 */
export function findConflicts(rulings: RoleRuling[]): { signal: string; rulingIds: number[] }[] {
  const bySignal = new Map<string, RoleRuling[]>();
  for (const r of rulings) {
    if (!r.targetSignal) continue;
    const list = bySignal.get(r.targetSignal) ?? [];
    list.push(r);
    bySignal.set(r.targetSignal, list);
  }
  const out: { signal: string; rulingIds: number[] }[] = [];
  for (const [signal, list] of bySignal) {
    const directions = new Set(list.map((r) => r.claimedRole));
    if (directions.size > 1 || list.some((r) => r.proposedEdit === "remove_signal") && list.length > 1) {
      out.push({ signal, rulingIds: list.map((r) => r.id) });
    }
  }
  return out;
}

const SCHEMA_NOTE = `Each entry in \`signals\` is:

    {
      "id": "kebab-case-unique-id",
      "region": "<JS regex source, matched against the wine's region + country + raw label, lowercased and de-accented>",
      "variety": "<optional JS regex source, matched against the RESOLVED canonicalised varieties>",
      "exclude": "<optional JS regex source, matched against the same string as region; VETOES the match>",
      "note": "<why this entry exists, in prose>",
      "source": "ruling:<id>"
    }

Each entry in \`notCounted\` is:

    { "id": "kebab-case-id", "label": "Human readable wine class", "why": "<cited reason>", "source": "ruling:<id>" }

Matching contract, which the regexes must respect:
- Everything is lowercased and de-accented before matching, so write patterns in lowercase ASCII
  ("chateauneuf", not "Châteauneuf").
- An UNRESOLVED variety does NOT veto a region match — \`variety\` is skipped when the key could not
  resolve a grape. So a variety gate narrows, it never guarantees.
- The default is CURVEBALL. Omitting a wine is safe; adding one that should not be there is not.`;

/** The build brief. Deterministic — the same rulings always produce the same text. */
export function buildCodifyBrief(rulings: RoleRuling[]): { context: string; analysisText: string } {
  const table = bankerSignalTable();
  const conflicts = findConflicts(rulings);

  const items = rulings.map((r) => {
    const target = r.targetSignal
      ? table.signals.find((s) => s.id === r.targetSignal)
      : undefined;
    const current = target
      ? `Current entry \`${target.id}\`: region /${target.region.source}/` +
        (target.variety ? `, variety /${target.variety.source}/` : "") +
        (target.exclude ? `, exclude /${target.exclude.source}/` : "")
      : r.targetSignal
        ? `NAMED SIGNAL \`${r.targetSignal}\` DOES NOT EXIST in the current table — treat this as add_signal and choose a new id.`
        : "No existing signal named.";
    return [
      `### Ruling ${r.id} — ${r.proposedEdit}`,
      `Wine: ${r.wineLabel ?? "(label unavailable)"}`,
      `Resolved as: ${[r.variety, r.region, r.country].filter(Boolean).join(" / ") || "(unresolved)"}`,
      `Reviewer ${r.reviewerName ?? "(unknown)"} said this wine is a ${r.claimedRole.toUpperCase()}; ` +
        `the table read it as a ${r.keyedRole.toUpperCase()}. The claim was UPHELD.`,
      `Adjudicator's reasoning: ${r.rationale ?? "(none recorded)"}`,
      current,
      ``,
      `Corpus evidence that was in front of the adjudicator:`,
      renderCorpusEvidence(corpusEvidenceFor(r)),
      ``,
      `Required stamp on whatever you add or amend: "source": "ruling:${r.id}"`,
    ].join("\n");
  });

  const context = [
    `Codifying ${rulings.length} upheld banker/curveball ruling${rulings.length === 1 ? "" : "s"} ` +
      `from the Question Review surface into data/banker_signals.json.`,
    ``,
    conflicts.length > 0
      ? `## ⚠ CONFLICTS — READ BEFORE MERGING\n` +
        conflicts
          .map(
            (c) =>
              `- Signal \`${c.signal}\` is targeted by rulings ${c.rulingIds.join(", ")} pulling in ` +
              `different directions. The reviewer(s) may be describing two compatible refinements, or ` +
              `they may disagree. Resolve this in review — do not merge a net edit nobody decided.`
          )
          .join("\n") +
        `\n`
      : "",
    `## The rulings`,
    ``,
    items.join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n");

  const analysisText = [
    `### Proposed Change (authoritative — implement exactly this)`,
    ``,
    `Edit **data/banker_signals.json** to carry out each ruling listed in the context above, then copy`,
    `the result to **study-app/public/data/banker_signals.json** (byte-identical — a test asserts it,`,
    `and the deployed build reads the public copy).`,
    ``,
    SCHEMA_NOTE,
    ``,
    `### What each edit type means`,
    `- **add_signal** — append a new entry to \`signals\`. Prefer a variety gate; a bare region match`,
    `  promotes every oddity from that region too. Do not widen an existing entry to cover the new wine`,
    `  unless the ruling says so.`,
    `- **narrow_signal** — amend the named entry by ADDING a \`variety\` gate or an \`exclude\` pattern.`,
    `  Do not delete it: it is catching wines it should catch, and this ruling is about one it should not.`,
    `- **remove_signal** — delete the named entry AND add a \`notCounted\` entry recording why, so the`,
    `  next reviewer to dispute it sees the reasoning rather than re-litigating it.`,
    `- **add_exclusion** — append to \`notCounted\` only. Nothing in \`signals\` changes.`,
    ``,
    `### Also required in this PR`,
    `1. Update **study-app/tests/banker-signals.test.ts** with a case pinning each ruling's outcome —`,
    `   the wine that prompted it must now classify the way the ruling says. A codification with no`,
    `   test is indistinguishable next month from a hand-edit somebody made for a different reason.`,
    `2. Run the existing suite. **study-app/tests/flight-composition.test.ts pins the reviewer's own`,
    `   prior calibration**, so a ruling that breaks it is either genuinely superseding an earlier`,
    `   decision — in which case update that test and SAY SO in the PR body — or is wrong. Do not`,
    `   loosen an assertion to make a build pass.`,
    `3. In the PR body, state the blast radius: which existing signals changed and, in one line each,`,
    `   what class of wine now classifies differently.`,
    ``,
    `### What NOT to do`,
    `- Do not touch \`BANKER_SIGNALS\` in question-validator.ts. It no longer exists; the table is this`,
    `  JSON file and the loader is src/lib/banker-signals.ts.`,
    `- Do not "tidy" unrelated entries, reorder the file, or rewrite notes. Every line in it is cited`,
    `  evidence from a previous decision, and a diff that touches more than the rulings above cannot be`,
    `  reviewed for what it actually changes.`,
    ``,
    `Kind: validator`,
  ].join("\n");

  return { context, analysisText };
}

/**
 * Dispatch one PR carrying every uncodified upheld ruling.
 *
 * Marks the rulings dispatched by stamping `pr_url` with the work branch. That is a placeholder, not a
 * URL: nothing pushes the real PR link back to us until the Action writes it, and leaving the field
 * NULL would make the next call pick the same rulings up and open a second PR for them.
 */
export async function codifyUpheldRulings(opts: {
  adminUserId: number;
  rulingIds?: number[];
  limit?: number;
}): Promise<
  | { dispatched: true; workBranch: string; rulingIds: number[]; conflicts: { signal: string; rulingIds: number[] }[] }
  | { dispatched: false; reason: string }
> {
  const all = await getCodifiableRulings(opts.limit ?? 25);
  const rulings =
    opts.rulingIds && opts.rulingIds.length > 0
      ? all.filter((r) => opts.rulingIds!.includes(r.id))
      : all;
  if (rulings.length === 0) return { dispatched: false, reason: "nothing_to_codify" };

  const { context, analysisText } = buildCodifyBrief(rulings);
  const workBranch = `role-ruling/batch-${rulings[0].id}-${rulings.length}`;

  await dispatchRepositoryEvent("auto-feedback", {
    // attemptId 0 + no analysisId: the same convention the bin-fix miner uses to tell the Action there
    // is no feedback_analyses row to write back to.
    attemptId: 0,
    appliedBy: `admin:${opts.adminUserId}`,
    workBranch,
    context,
    analysisText,
    allowedPaths: VALIDATOR_PATHS.join("\n"),
    reviewOnly: "true",
  });

  const sql = db();
  await sql`
    UPDATE wine_role_rulings
    SET pr_url = ${`branch:${workBranch}`}, updated_at = NOW()
    WHERE id = ANY(${rulings.map((r) => r.id)})
  `;

  return { dispatched: true, workBranch, rulingIds: rulings.map((r) => r.id), conflicts: findConflicts(rulings) };
}

/**
 * Mark rulings as landed once their PR has merged, which is what makes them eligible for the bank
 * sweep. Called by the admin "the PR merged" action and by the reconciler.
 *
 * Separate from dispatch on purpose: a ruling whose PR is open has NOT changed the calibration, so
 * sweeping the bank against it would queue repairs for a rule that does not exist yet.
 */
export async function markRulingsCodified(rulingIds: number[], prUrl?: string | null): Promise<number> {
  if (rulingIds.length === 0) return 0;
  const sql = db();
  const rows = await sql`
    UPDATE wine_role_rulings
    SET codified_at = NOW(),
        pr_url = COALESCE(${prUrl ?? null}, pr_url),
        updated_at = NOW()
    WHERE id = ANY(${rulingIds}) AND codified_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

/** Human-readable summary of what a signal does, for the admin UI. */
export function describeSignal(signalId: string): string | null {
  const s = bankerSignalTable().signals.find((x) => x.id === signalId);
  if (!s) return null;
  return (
    describePattern(s.region) +
    (s.variety ? ` — only as ${describePattern(s.variety)}` : "") +
    (s.exclude ? ` (not ${describePattern(s.exclude)})` : "")
  );
}
