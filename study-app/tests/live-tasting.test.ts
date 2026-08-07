import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validatePinnedFlight,
  validateBlindSafety,
  splitPinnedReference,
} from "@/lib/live-tasting-validators";
import { deriveSessionState, deriveBlindIntegrity } from "@/lib/live-tasting";
import { byoFullText, validateEnteredWines, pickArchetype } from "@/lib/live-tasting-engine";
import { validatePaperScope } from "@/lib/question-engine";
import { checkWineReferenceShape } from "@/lib/question-rules.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Pinned-flight validator ──────────────────────────────────────────────────────────────────────

const PINNED = [
  { slot: 1, fullText: "E. Guigal, Côte-Rôtie Brune et Blonde. Rhône, France." },
  { slot: 2, fullText: "Penfolds, Bin 28 Kalimna Shiraz. South Australia, Australia." },
];

describe("validatePinnedFlight", () => {
  it("passes when the draft reproduces the pinned wines (accents may differ)", () => {
    const r = validatePinnedFlight(PINNED, [
      { slot: 1, fullText: "E. Guigal, Cote-Rotie Brune et Blonde. Rhone, France." },
      { slot: 2, fullText: "Penfolds, Bin 28 Kalimna Shiraz. South Australia, Australia." },
    ]);
    expect(r.valid).toBe(true);
  });

  it("fails on a substituted producer", () => {
    const r = validatePinnedFlight(PINNED, [
      { slot: 1, fullText: "Domaine Jamet, Côte-Rôtie. Rhône, France." },
      { slot: 2, fullText: "Penfolds, Bin 28 Kalimna Shiraz. South Australia, Australia." },
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain("slot 1");
  });

  it("fails on a wrong flight size or missing slot", () => {
    expect(validatePinnedFlight(PINNED, [{ slot: 1, fullText: PINNED[0].fullText }]).valid).toBe(false);
    expect(
      validatePinnedFlight(PINNED, [
        { slot: 1, fullText: PINNED[0].fullText },
        { slot: 3, fullText: PINNED[1].fullText },
      ]).valid
    ).toBe(false);
  });
});

describe("validateBlindSafety", () => {
  it("passes a clean MW-style stem", () => {
    const r = validateBlindSafety(
      "Wines 1 and 2 are from the same grape variety grown in different countries. For each wine, identify the grape variety and origin as closely as possible. (50 marks)",
      PINNED
    );
    expect(r.valid).toBe(true);
  });

  it("catches a leaked producer, including accent-normalized forms", () => {
    expect(validateBlindSafety("Wine 1 is a Guigal bottling from the northern Rhône.", PINNED).valid).toBe(false);
    // Accented stem leak vs bare-form pinned token — the historical bug class.
    expect(validateBlindSafety("Compare this to classic Pénfolds styling.", PINNED).valid).toBe(false);
  });

  it("never fires on generic trade words inside producer names (the Ramey Wine Cellars pilot bug)", () => {
    // "Ramey Wine Cellars" → tokens must reduce to {ramey}; "wine" appears in EVERY stem, and
    // treating it as identity made generation permanently unable to converge for this producer.
    const r = validateBlindSafety(
      "Wines 1-3 are dry white wines made from the same grape variety. For each wine, identify the variety and origin. (75 marks)",
      [{ slot: 1, fullText: "Ramey Wine Cellars, Russian River Valley Chardonnay. Sonoma, USA." }]
    );
    expect(r.valid).toBe(true);
    // The actually-distinctive token still fires.
    expect(validateBlindSafety("This shows classic Ramey oak handling.",
      [{ slot: 1, fullText: "Ramey Wine Cellars, Russian River Valley Chardonnay. Sonoma, USA." }]).valid).toBe(false);
  });

  it("catches a leaked cuvée token but ignores generic wine words", () => {
    expect(validateBlindSafety("Wine 2 shows classic Kalimna character.", PINNED).valid).toBe(false);
    // "brut"/"reserve"/"blanc" are generic and must never fire.
    const generic = validateBlindSafety(
      "Wine 1 is a brut reserve style with blanc fruit.",
      [{ slot: 1, fullText: "Billecart-Salmon, Brut Réserve. Champagne, France." }]
    );
    expect(generic.valid).toBe(true);
  });
});

describe("splitPinnedReference", () => {
  it("splits producer from cuvée", () => {
    expect(splitPinnedReference("E. Guigal, Côte-Rôtie Brune et Blonde. Rhône, France.")).toEqual({
      producer: "E. Guigal",
      cuvee: "Côte-Rôtie Brune et Blonde",
    });
  });
});

// ── Derived state + blind badge (plan §2.3: facts, not a status enum) ───────────────────────────

const base = { user_revealed_at: null, token_first_used_at: null, graded_at: null, abandoned_at: null };

describe("deriveSessionState / deriveBlindIntegrity", () => {
  it("derives the display state from event facts", () => {
    expect(deriveSessionState(base)).toBe("shopping");
    expect(deriveSessionState({ ...base, graded_at: "2026-08-05" })).toBe("tasted");
    expect(deriveSessionState({ ...base, abandoned_at: "2026-08-05" })).toBe("abandoned");
    // BYO (migration 043): no question yet = tasting prep; grading/abandonment still win.
    expect(deriveSessionState({ ...base, question_id: null })).toBe("prep");
    expect(deriveSessionState({ ...base, question_id: "gen_x" })).toBe("shopping");
    expect(deriveSessionState({ ...base, question_id: null, abandoned_at: "2026-08-06" })).toBe("abandoned");
  });

  it("the badge can only downgrade: self-reveal beats partner share", () => {
    expect(deriveBlindIntegrity(base)).toBe("unopened");
    expect(deriveBlindIntegrity({ ...base, token_first_used_at: "2026-08-05" })).toBe("partner");
    // Partner shopped AND the user later peeked → self, permanently.
    expect(
      deriveBlindIntegrity({ ...base, token_first_used_at: "2026-08-05", user_revealed_at: "2026-08-06" })
    ).toBe("self");
  });
});

// ── Pool-isolation source guard (plan §2.6) ─────────────────────────────────────────────────────
//
// scope='live-tasting' rows are session-private. Every candidate-facing pool read must carry the
// scope='pool' filter; losing one in a refactor would silently serve another user's Live Tasting
// question (with its purchasable, identity-revealing wine list) into the general study pools.

describe("pool queries filter scope='pool'", () => {
  const dbSrc = fs.readFileSync(path.join(appDir, "src/lib/db.ts"), "utf8");

  const fnBody = (name: string): string => {
    const start = dbSrc.indexOf(`export async function ${name}`);
    expect(start, `${name} exists in db.ts`).toBeGreaterThan(-1);
    const rest = dbSrc.slice(start);
    const end = rest.indexOf("\nexport ", 10);
    return end > 0 ? rest.slice(0, end) : rest;
  };

  for (const fn of [
    "getQuestionsByFilter",
    "getRecentGeneratedQuestions",
    "getUnansweredQuestions",
    "getBankCount",
    "getEligibleBankedQuestions",
  ]) {
    it(`${fn} filters on scope='pool'`, () => {
      expect(fnBody(fn)).toMatch(/scope = 'pool'/);
    });
  }

  it("KEPT_BANK_SQL_WHERE (bank health) filters on scope='pool'", () => {
    const line = dbSrc.split("\n").find((l) => l.includes("const KEPT_BANK_SQL_WHERE"));
    expect(line).toBeTruthy();
    expect(line).toContain("scope = 'pool'");
  });

  for (const file of [
    "src/app/api/stem-sniper/drill/produce.ts",
    "src/app/api/stem-sniper/next/route.ts",
  ]) {
    it(`${file} (drill serve path) filters on scope='pool'`, () => {
      const src = fs.readFileSync(path.join(appDir, file), "utf8");
      expect(src).toMatch(/q\.scope = 'pool'/);
    });
  }
});

// ── Serve-payload redaction guard (plan §6.1) ───────────────────────────────────────────────────
//
// The pre-reveal session payload must never include wine identity. The live E2E harness probes
// this against the running app; this source guard catches the cheap regression (someone adding
// wines/model_answer to the base payload object) at build time.

describe("pre-reveal payload redaction (source guard)", () => {
  it("the session detail route only exposes wines/model answer under `reveal` after grading", () => {
    const src = fs.readFileSync(path.join(appDir, "src/app/api/live-tasting/[id]/route.ts"), "utf8");
    const baseBlock = src.slice(src.indexOf("const base = {"), src.indexOf("if (state !== \"tasted\")"));
    expect(baseBlock).not.toMatch(/wines|model_answer|modelAnswer|stockists:|fullText/);
    // The reveal block exists and is only reachable post-graded_at.
    expect(src).toContain('if (state !== "tasted") return Response.json(base)');
    expect(src).toContain("reveal: {");
  });
});

// ── BYO wine entry (migration 043) ──────────────────────────────────────────────────────────────

describe("byoFullText — entered wines become valid corpus references", () => {
  it("produces the reference shape the validators demand", () => {
    const refs = [
      byoFullText({ producer: "Louis Jadot", wineName: "Pouilly-Fuissé", vintage: "2022", country: "France", region: "Burgundy" }),
      byoFullText({ producer: "Billecart-Salmon", wineName: "Brut Réserve", vintage: "NV", country: "France", region: "Champagne" }),
      byoFullText({ producer: "Penfolds", wineName: "Bin 28 Shiraz", vintage: "2021", country: "Australia" }),
    ];
    expect(refs[0]).toBe("Louis Jadot, Pouilly-Fuissé 2022. Burgundy, France.");
    expect(refs[1]).toBe("Billecart-Salmon, Brut Réserve. Champagne, France."); // NV: no year in the label
    for (const r of refs) {
      expect(checkWineReferenceShape(r).ok, r).toBe(true);
    }
  });
});

describe("validateEnteredWines", () => {
  const good = { producer: "Louis Jadot", wineName: "Mâcon-Villages", vintage: "2022", country: "France" };
  it("accepts 2-4 well-formed wines and normalizes vintage/price", () => {
    const r = validateEnteredWines([good, { ...good, vintage: "nv", price: "23.99" }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wines[1].vintage).toBe("NV");
      expect(r.wines[1].price).toBe(23.99);
    }
  });
  it("rejects missing producer/country, bad vintages, and wrong counts", () => {
    expect(validateEnteredWines([good]).ok).toBe(false);
    expect(validateEnteredWines([good, { ...good, producer: "" }]).ok).toBe(false);
    expect(validateEnteredWines([good, { ...good, country: "" }]).ok).toBe(false);
    expect(validateEnteredWines([good, { ...good, vintage: "202" }]).ok).toBe(false);
    expect(validateEnteredWines("nope").ok).toBe(false);
  });
});

// ── Picker paper-scope gate (regression: paper ltpr_nrtphwgod, 2026-08-07) ────────────────────────
//
// The same-origin (F2) archetype grouped still_dry rows by country with NO colour constraint, so a
// Paper 1 flight was pinned with Juan Gil Monastrell. The pinned-flight validator then required the
// question to use that wine and paperScope required it gone — unsatisfiable, and the repair loop
// burned 40 model calls without ever producing the flight. The picker must never emit a flight that
// the post-generation validator would reject.

const bankRow = (o: Partial<Parameters<typeof pickArchetype>[0][number]> & { id: string }) => ({
  producer: "Producer",
  wine_name: "Cuvée",
  country: "Spain",
  region: "Rioja",
  grape_varieties: [] as unknown,
  style_category: "still_dry",
  price_band: "premium",
  ...o,
});

// One country, many varieties — exactly the shape same-origin groups on. Half are red.
const SPANISH_BANK = [
  bankRow({ id: "w1", producer: "Bodegas Juan Gil", wine_name: "Silver Label Monastrell", region: "Jumilla", grape_varieties: ["Monastrell"] }),
  bankRow({ id: "w2", producer: "Muga", wine_name: "Reserva", region: "Rioja", grape_varieties: ["Tempranillo"] }),
  bankRow({ id: "w3", producer: "Quinta dos Roques", wine_name: "Touriga Nacional", region: "Dão", grape_varieties: ["Touriga Nacional"] }),
  bankRow({ id: "w4", producer: "Bodegas Valdesil", wine_name: "Montenovo Godello", region: "Valdeorras", grape_varieties: ["Godello"] }),
  bankRow({ id: "w5", producer: "Pazo Señorans", wine_name: "Albariño", region: "Rías Baixas", grape_varieties: ["Albariño"] }),
  bankRow({ id: "w6", producer: "Bodegas Naia", wine_name: "Verdejo", region: "Rueda", grape_varieties: ["Verdejo"] }),
  bankRow({ id: "w7", producer: "López de Heredia", wine_name: "Viña Gravonia", region: "Rioja", grape_varieties: ["Viura"] }),
];

describe("pickArchetype paper scope", () => {
  it("never pins a red wine into a Paper 1 same-origin flight", () => {
    // Shuffled internally, so run it enough times that a colour-blind picker cannot get lucky.
    for (let i = 0; i < 40; i++) {
      const picked = pickArchetype(SPANISH_BANK, 1, 3, { require: "same-origin" });
      expect(picked.archetype).toBe("same-origin");
      const scope = validatePaperScope(
        1,
        picked.slots.map((s, idx) => ({
          slot: idx + 1,
          fullText: `${s.row.producer}, ${s.row.wine_name}. ${s.row.region}, ${s.row.country}.`,
        }))
      );
      expect(scope.violations).toEqual([]);
      // Alternates get pinned too whenever availability misses on the primary.
      for (const alt of picked.slots.flatMap((s) => s.alternates)) {
        expect(
          validatePaperScope(1, [{ slot: 1, fullText: `${alt.producer}, ${alt.wine_name}. ${alt.region}, ${alt.country}.` }]).violations
        ).toEqual([]);
      }
    }
  });

  it("never pins a white wine into a Paper 2 same-origin flight", () => {
    for (let i = 0; i < 40; i++) {
      const picked = pickArchetype(SPANISH_BANK, 2, 2, { require: "same-origin" });
      const scope = validatePaperScope(
        2,
        picked.slots.map((s, idx) => ({
          slot: idx + 1,
          fullText: `${s.row.producer}, ${s.row.wine_name}. ${s.row.region}, ${s.row.country}.`,
        }))
      );
      expect(scope.violations).toEqual([]);
    }
  });

  it("fails loudly rather than pinning off-colour wines when the bank is too thin", () => {
    const redsOnly = SPANISH_BANK.filter((r) => ["w1", "w2", "w3"].includes(r.id));
    expect(() => pickArchetype(redsOnly, 1, 3, { require: "same-origin" })).toThrow(/wine bank/i);
  });
});

// ── The pin outranks deprioritization ────────────────────────────────────────────────────────────
//
// samplePaperComposition deliberately allows a family twice per full paper (famCap = 2, matching the
// corpus), and paper ltpr_egt9dfy3e planned F4/F2/F4/F2. It was BUILT as F4/F2/F1/F7: the
// deprioritization sort was applied to the whole try-order including the pinned archetype, so once an
// earlier flight had used that archetype the pin ranked last and any unused archetype beat it —
// breaking the second occurrence of every repeated family, deterministically.
//
// This French white bank can satisfy BOTH same-origin (one country, distinct varieties) and
// mixed-variety (distinct varieties from classic origins), so a defeated pin has somewhere to go and
// the test genuinely fails against the old ordering. same-variety (needs one variety across 3+
// origins) and quality-ladder (needs 2+ price bands in one region) cannot be built from it.
const FRENCH_WHITE_BANK = [
  bankRow({ id: "f1", country: "France", producer: "Domaine Leflaive", wine_name: "Mâcon-Verzé Chardonnay", region: "Burgundy", grape_varieties: ["Chardonnay"] }),
  bankRow({ id: "f2", country: "France", producer: "Pascal Jolivet", wine_name: "Sancerre Sauvignon Blanc", region: "Loire", grape_varieties: ["Sauvignon Blanc"] }),
  bankRow({ id: "f3", country: "France", producer: "Domaine Huet", wine_name: "Vouvray Sec Chenin Blanc", region: "Loire", grape_varieties: ["Chenin Blanc"] }),
  bankRow({ id: "f4", country: "France", producer: "Trimbach", wine_name: "Riesling Réserve", region: "Alsace", grape_varieties: ["Riesling"] }),
];

describe("pickArchetype honours a pinned archetype over deprioritization", () => {
  it("keeps the planned family when an earlier flight already used it", () => {
    for (let i = 0; i < 40; i++) {
      const picked = pickArchetype(FRENCH_WHITE_BANK, 1, 3, {
        require: "same-origin",
        // Position 2 of a paper whose composition repeats F2: same-origin is both required and used.
        deprioritizeArchetypes: new Set(["same-origin"]),
      });
      expect(picked.archetype).toBe("same-origin");
    }
  });

  it("still de-prioritizes a used archetype among the FALLBACKS", () => {
    // No pin: mixed-variety is the only archetype this bank can build, and marking it used must not
    // make the picker throw — deprioritization is an ordering preference, never a ban.
    for (let i = 0; i < 20; i++) {
      const picked = pickArchetype(FRENCH_WHITE_BANK, 1, 3, {
        deprioritizeArchetypes: new Set(["mixed-variety"]),
      });
      expect(picked.archetype).toBe("mixed-variety");
    }
  });

  it("falls back when the bank genuinely cannot build the pinned archetype", () => {
    // One country, one variety per origin is fine for same-origin but there is no Chardonnay ladder
    // here — a pin the bank cannot satisfy still yields a paper rather than failing.
    const picked = pickArchetype(FRENCH_WHITE_BANK, 1, 3, { require: "quality-ladder" });
    expect(picked.archetype).not.toBe("quality-ladder");
  });
});
