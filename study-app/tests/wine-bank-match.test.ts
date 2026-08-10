import { describe, it, expect } from "vitest";
import { matchScore, pickBestEntry, type WineBankEntry } from "../src/lib/wine-bank-lookup";

// The wrong-cuvée bug (2026-08-05): matchScore weights producer 60% / wine-name 40%, so a perfect
// producer hit with barely any cuvée overlap cleared lookupWine's 0.7 threshold and served a
// DIFFERENT wine's tasting profile and citations. These tests pin the cuvée gate that stops it.

const entry = (producer: string, wine_name: string, colour?: string): WineBankEntry => ({
  id: "test",
  producer,
  wine_name,
  country: "France",
  region: "Loire Valley",
  grape_varieties: [],
  style_category: "still_dry",
  ...(colour ? { colour } : {}),
});

// lookupWine accepts bestScore >= 0.7; matchScore must stay below that (the gate returns 0)
// for a wrong cuvée and at/above it for the true wine.
const THRESHOLD = 0.7;

describe("wine bank matcher — cuvée gate", () => {
  it("rejects a different cuvée from the same producer (Crochet: Le Chêne vs La Croix du Roy)", () => {
    const croixDuRoy = entry("Domaine Lucien Crochet", "Sancerre Blanc La Croix du Roy");
    const score = matchScore(
      "Lucien Crochet Sancerre Blanc Le Chêne 2022. Loire Valley, France. (13.5%)",
      croixDuRoy
    );
    expect(score).toBeLessThan(THRESHOLD);
  });

  it("rejects a sibling vineyard bottling (Leflaive: Les Combettes vs Clavoillon)", () => {
    const clavoillon = entry("Domaine Leflaive", "Puligny-Montrachet Clavoillon Premier Cru");
    const score = matchScore(
      "Domaine Leflaive Puligny-Montrachet Les Combettes Premier Cru 2022. Burgundy, France. (13.0%)",
      clavoillon
    );
    expect(score).toBeLessThan(THRESHOLD);
  });

  it("still matches the true wine when the query names the cuvée (Le Chêne Marchand)", () => {
    const cheneMarchand = entry("Domaine Lucien Crochet", "Sancerre Blanc Le Chêne Marchand");
    const score = matchScore(
      "Lucien Crochet Sancerre Blanc Le Chêne Marchand 2022. Loire Valley, France. (13.5%)",
      cheneMarchand
    );
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("still matches when vintage, ABV, accents and noise words differ", () => {
    const maconVerze = entry("Domaine Leflaive", "Mâcon-Verzé");
    const score = matchScore(
      "Domaine Leflaive Macon-Verze 2023. Mâconnais, Burgundy, France. (13.0%)",
      maconVerze
    );
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("still matches a short generic cuvée against its own full text (Kumeu River Estate Chardonnay)", () => {
    const kumeu = entry("Kumeu River", "Estate Chardonnay");
    const score = matchScore(
      "Kumeu River, Estate Chardonnay, 2022. Auckland, New Zealand. (13.5%)",
      kumeu
    );
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("keeps the producer gate: same appellation, different producer does not match", () => {
    const cotat = entry("François Cotat", "Sancerre Les Monts Damnés");
    const score = matchScore(
      "Lucien Crochet Sancerre Blanc Le Chêne Marchand 2022. Loire Valley, France. (13.5%)",
      cotat
    );
    expect(score).toBe(0);
  });
});

// The substring-match bug (found 2026-08-10). Producer tokens were compared with
// `qt.includes(pt) || pt.includes(qt)`, so any token CONTAINING another counted as a hit. With
// `clos`/`vina`/`casa`/`bodegas` treated as noise, a producer often reduced to one short token, and a
// single substring hit scored a perfect 1.0 on the producer half. 77 of 1,675 bank-matched wines in
// the live bank resolved to a producer absent from the label — all 77 stamped confidence:"high".
//
// Each case below is a REAL pair taken from wine_profiles, not a constructed one.
describe("wine bank matcher — producer tokens match exactly, not by substring", () => {
  const cases: Array<[string, string, string, string]> = [
    ["Alto Adige is not Aalto", "Cantina Terlano, Vorberg Pinot Bianco Riserva, 2020. Alto Adige, Italy. (13.5%)", "Bodegas Aalto", "Aalto PS"],
    ["Hunter Valley is not Clos du Val", "Bimbadgen, Signature Chardonnay, 2022. Hunter Valley, New South Wales, Australia. (13%)", "Clos du Val", "Chardonnay"],
    ["Alma Grande is not Almaviva", "Bellavista, Franciacorta Alma Grande Cuvée Brut, NV. Franciacorta, Lombardy, Italy. (12.5%)", "Almaviva", "Almaviva"],
    ["Carmenère is not Carmen", "Casa Silva, Los Lingues Gran Reserva Carmenere, 2021. Colchagua Valley, Chile. (14%)", "Viña Carmen", "Gran Reserva Carmenere"],
    ["Châteauneuf-du-Pape is not Clos des Papes", "Château de Beaucastel, Châteauneuf-du-Pape Blanc Vieilles Vignes Roussanne, 2021. Châteauneuf-du-Pape, Rhône Valley, France. (14.0%)", "Clos des Papes", "Châteauneuf-du-Pape"],
  ];

  for (const [name, label, producer, wineName] of cases) {
    it(name, () => {
      expect(matchScore(label, entry(producer, wineName))).toBe(0);
    });
  }
});

// Exact matching removed the substring noise that used to (accidentally) separate a producer's
// flagship from its estate wine, exposing a latent tie: the appellation is written on every label, so
// an entry NAMED after the appellation scores a perfect 1.0 on a flagship's label. `score > bestScore`
// then kept whichever the bank listed first. Real regressions caught in the 2026-08-10 rematch dry run.
describe("wine bank matcher — ties break toward the more specific cuvée", () => {
  const id = (e: { entry: WineBankEntry } | null) => e?.entry.id ?? null;
  const named = (idStr: string, producer: string, wine_name: string): WineBankEntry => ({
    ...entry(producer, wine_name), id: idStr,
  });

  it("keeps The Virgilius over generic Eden Valley Viognier", () => {
    const bank = [
      named("generic", "Yalumba", "Eden Valley Viognier"),
      named("virgilius", "Yalumba", "The Virgilius Viognier"),
    ];
    const label = "Yalumba, The Virgilius Viognier, 2022. Eden Valley, South Australia, Australia. (13%)";
    expect(id(pickBestEntry(label, bank))).toBe("virgilius");
    // …and independent of the order the bank happens to list them in.
    expect(id(pickBestEntry(label, [...bank].reverse()))).toBe("virgilius");
  });

  it("keeps Assyrtiko Kavalieros over bare Assyrtiko", () => {
    const bank = [
      named("bare", "Domaine Sigalas", "Assyrtiko"),
      named("kavalieros", "Domaine Sigalas", "Assyrtiko Kavalieros"),
    ];
    const label = "Domaine Sigalas Kavalieros Assyrtiko 2023. Santorini, Greece. (13.5%)";
    expect(id(pickBestEntry(label, bank))).toBe("kavalieros");
    expect(id(pickBestEntry(label, [...bank].reverse()))).toBe("kavalieros");
  });
});

describe("wine bank matcher — colour gate", () => {
  // Beaucastel makes both colours, so the producer gate passes honestly and the cuvée gate only sees
  // whether the NAMES overlap. Serving a red profile for a white is the most visible defect an
  // examiner can catch, and 24 live wines carried one.
  const label =
    "Château de Beaucastel, Châteauneuf-du-Pape Blanc Vieilles Vignes Roussanne, 2021. Châteauneuf-du-Pape, Rhône Valley, France. (14.0%)";

  it("refuses a red bank entry for a wine labelled Blanc", () => {
    expect(matchScore(label, entry("Beaucastel", "Châteauneuf-du-Pape Blanc Vieilles Vignes Roussanne", "red"))).toBe(0);
  });

  it("accepts the same entry when the colour agrees", () => {
    const score = matchScore(label, entry("Beaucastel", "Châteauneuf-du-Pape Blanc Vieilles Vignes Roussanne", "white"));
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("treats orange as white — a skin-contact white is still labelled Bianco", () => {
    const score = matchScore(
      "Radikon, Ribolla Gialla Bianco, 2019. Venezia Giulia, Italy. (13%)",
      entry("Radikon", "Ribolla Gialla Bianco", "orange")
    );
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });

  it("stays out of the way when the entry has no colour recorded", () => {
    const score = matchScore(label, entry("Beaucastel", "Châteauneuf-du-Pape Blanc Vieilles Vignes Roussanne"));
    expect(score).toBeGreaterThanOrEqual(THRESHOLD);
  });
});
