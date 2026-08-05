import { describe, it, expect } from "vitest";
import { isBankableIdentity } from "@/lib/wine-enrichment";

/**
 * Ten rows reached wine_bank that were not wines. These are the real ones, verbatim from Neon
 * (2026-08-05), asserted as a regression suite.
 *
 * The style names matter most: classifyWine categorised them CORRECTLY — Fino as fortified, Auslese
 * as still_sweet — which is exactly why they looked plausible enough to bank. A guard that reasons
 * about whether the classification is sensible would pass every one of them. This one keys on
 * structure only.
 */

const wine = (o: Partial<Parameters<typeof isBankableIdentity>[0]>) => ({
  producer: "", wineName: "", country: "", region: "", grapeVarieties: [], styleCategory: "still_dry",
  ...o,
});

describe("isBankableIdentity — rejects the rows that actually got in", () => {
  const junk: [string, ReturnType<typeof wine>][] = [
    ["France ✓ (checklist)", wine({ producer: "France ✓" })],
    ["Germany ✓ (checklist)", wine({ producer: "Germany ✓" })],
    ["Spain ✓ (checklist)", wine({ producer: "Spain ✓" })],
    ["South Africa ✓ (checklist)", wine({ producer: "South Africa ✓" })],
    ["Auslese — a style, correctly classified still_sweet",
      wine({ producer: "Auslese (naturally sweet wine) ✓", wineName: "Auslese", country: "Germany", styleCategory: "still_sweet" })],
    ["Fino — a style, correctly classified fortified",
      wine({ producer: "Fino (fortified/biologically aged) ✓", wineName: "Fino", country: "Spain", region: "Jerez", styleCategory: "fortified" })],
    ["Torcolato — a style",
      wine({ producer: "Torcolato (dried-grape sweet wine) ✓", wineName: "Torcolato", country: "Italy", region: "Veneto" })],
    ["Jurançon — an appellation",
      wine({ producer: "Jurançon (sweet wine) ✓", country: "France", region: "Jurançon" })],
    ["Schlossgut Diel — deliberation welded to the cuvée",
      wine({ producer: "Schlossgut Diel", wineName: "Schlossgut Diel — wait, Dönnhoff is on the deduplication list", country: "Germany", region: "Nahe" })],
    ["Zind-Humbrecht — no country and no region",
      wine({ producer: "Zind-Humbrecht" })],
  ];

  it.each(junk)("rejects %s", (_label, identity) => {
    const r = isBankableIdentity(identity);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("rejects a bare country even without a tick", () => {
    expect(isBankableIdentity(wine({ producer: "Portugal", country: "Portugal" })).ok).toBe(false);
  });

  it("rejects a prose fragment mistaken for a producer", () => {
    expect(isBankableIdentity(wine({
      producer: "The P3 STILL_DRY sub-rule requires that a still dry white is only in scope",
      country: "France",
    })).ok).toBe(false);
  });
});

describe("isBankableIdentity — admits real wines", () => {
  const good: [string, ReturnType<typeof wine>][] = [
    ["Burgundy white", wine({ producer: "Domaine Leflaive", wineName: "Mâcon-Verzé", country: "France", region: "Burgundy" })],
    ["accented producer with an initial", wine({ producer: "R. López de Heredia", wineName: "Viña Tondonia Blanco Reserva", country: "Spain", region: "Rioja" })],
    ["NV Champagne, no cuvée", wine({ producer: "Agrapart & Fils", country: "France", region: "Champagne" })],
    ["region but no country", wine({ producer: "Nyetimber", wineName: "Classic Cuvée", region: "West Sussex" })],
    ["country but no region", wine({ producer: "Felton Road", wineName: "Bannockburn Pinot Noir", country: "New Zealand" })],
    ["numeral in the cuvée", wine({ producer: "Equipo Navazos", wineName: "La Bota de Manzanilla Pasada No. 80", country: "Spain", region: "Jerez" })],
    ["short but real producer", wine({ producer: "COS", wineName: "Frappato", country: "Italy", region: "Sicily" })],
  ];

  it.each(good)("admits %s", (_label, identity) => {
    expect(isBankableIdentity(identity)).toEqual({ ok: true });
  });

  it("does not reject a producer whose name merely contains a country word", () => {
    // "Bodegas Chile" style names must survive — the check is equality, not substring.
    expect(isBankableIdentity(wine({ producer: "Viña Chile Andes", country: "Chile", region: "Maipo" })).ok).toBe(true);
  });
});
