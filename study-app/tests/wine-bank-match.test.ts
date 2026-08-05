import { describe, it, expect } from "vitest";
import { matchScore, type WineBankEntry } from "../src/lib/wine-bank-lookup";

// The wrong-cuvée bug (2026-08-05): matchScore weights producer 60% / wine-name 40%, so a perfect
// producer hit with barely any cuvée overlap cleared lookupWine's 0.7 threshold and served a
// DIFFERENT wine's tasting profile and citations. These tests pin the cuvée gate that stops it.

const entry = (producer: string, wine_name: string): WineBankEntry => ({
  id: "test",
  producer,
  wine_name,
  country: "France",
  region: "Loire Valley",
  grape_varieties: [],
  style_category: "still_dry",
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
