import { describe, it, expect } from "vitest";
import {
  BALANCE_TOLERANCE_PTS,
  MIN_WINES_FOR_BALANCE,
  leaningToward,
  joinCountries,
  buildCountryNudge,
  toCountryBalancePayload,
  type CountryBalance,
} from "../src/lib/bank-health/country-balance";
import {
  COUNTRY_TARGETS,
  OTHER_TARGET_PCT,
  canonicalCountry,
  targetPctFor,
} from "../src/lib/countryTargets";

// A tiny helper to build a balance fixture with a few rows.
function fixture(
  rows: { country: string; bankPct: number; targetPct: number; deltaPts: number; status: CountryBalance["rows"][number]["status"] }[],
  totalWines = 200
): CountryBalance {
  return { insufficient: false, totalWines, rows };
}

describe("countryTargets constant", () => {
  it("is ordered by target share descending and sums with Other to 100%", () => {
    const pcts = COUNTRY_TARGETS.map((t) => t.targetPct);
    for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
    const named = pcts.reduce((s, p) => s + p, 0);
    expect(Math.round((named + OTHER_TARGET_PCT) * 10) / 10).toBe(100);
    // France leads the historical shape, as the corpus shows.
    expect(COUNTRY_TARGETS[0].country).toBe("France");
  });

  it("collapses only sub-1.5% origins into Other (every named target ≥ 1.5%)", () => {
    for (const t of COUNTRY_TARGETS) expect(t.targetPct).toBeGreaterThanOrEqual(1.5);
  });

  it("canonicalises sub-national and alias origins onto named targets", () => {
    expect(canonicalCountry("California")).toBe("USA");
    expect(canonicalCountry("united states")).toBe("USA");
    expect(canonicalCountry("  italy ")).toBe("Italy");
    expect(canonicalCountry("new zealand")).toBe("New Zealand");
    expect(canonicalCountry("")).toBeNull();
    expect(targetPctFor("France")).toBe(33.5);
    expect(targetPctFor("Narnia")).toBe(0);
  });
});

describe("leaningToward + nudge", () => {
  const balance = fixture([
    { country: "France", bankPct: 33, targetPct: 33.5, deltaPts: -0.5, status: "on_track" },
    { country: "Italy", bankPct: 4, targetPct: 11.5, deltaPts: -7.5, status: "light" },
    { country: "Germany", bankPct: 0, targetPct: 4.9, deltaPts: -4.9, status: "light" },
    { country: "Portugal", bankPct: 2, targetPct: 5.4, deltaPts: -3.4, status: "on_track" },
    { country: "Spain", bankPct: 1, targetPct: 8.4, deltaPts: -7.4, status: "light" },
    { country: "USA", bankPct: 20, targetPct: 7.7, deltaPts: 12.3, status: "heavy" },
  ]);

  it("picks the top-3 most-deficient light countries, most-deficient first", () => {
    expect(leaningToward(balance)).toEqual(["Italy", "Spain", "Germany"]);
  });

  it("returns nothing when the read is insufficient", () => {
    expect(leaningToward({ insufficient: true, totalWines: 10, rows: [] })).toEqual([]);
    expect(buildCountryNudge({ insufficient: true, totalWines: 10, rows: [] })).toBeNull();
  });

  it("returns nothing to steer when nothing is light", () => {
    const onTrack = fixture([
      { country: "France", bankPct: 33, targetPct: 33.5, deltaPts: -0.5, status: "on_track" },
    ]);
    expect(leaningToward(onTrack)).toEqual([]);
    expect(buildCountryNudge(onTrack)).toBeNull();
  });

  it("builds a soft-only nudge that names the light origins and defers to the hard validators", () => {
    const nudge = buildCountryNudge(balance)!;
    expect(nudge).toContain("light on Italy, Spain and Germany");
    expect(nudge).toContain("soft preference only");
    expect(nudge).toMatch(/never override country-diversity or same-variety validator rules/);
  });

  it("joins country lists in human style", () => {
    expect(joinCountries(["Italy"])).toBe("Italy");
    expect(joinCountries(["Italy", "Germany"])).toBe("Italy and Germany");
    expect(joinCountries(["Italy", "Germany", "Portugal"])).toBe("Italy, Germany and Portugal");
  });
});

describe("API payload shape", () => {
  it("drops deltaPts, keeps target-sorted rows, and carries leaningToward", () => {
    const balance = fixture([
      { country: "Italy", bankPct: 4, targetPct: 11.5, deltaPts: -7.5, status: "light" },
    ]);
    const payload = toCountryBalancePayload(balance);
    expect(payload.rows[0]).toEqual({ country: "Italy", bankPct: 4, targetPct: 11.5, status: "light" });
    expect(payload.rows[0]).not.toHaveProperty("deltaPts");
    expect(payload.leaningToward).toEqual(["Italy"]);
    expect(payload.totalWines).toBe(200);
  });
});

describe("thresholds", () => {
  it("uses a ±4 point tolerance and a 40-wine floor (spec)", () => {
    expect(BALANCE_TOLERANCE_PTS).toBe(4);
    expect(MIN_WINES_FOR_BALANCE).toBe(40);
  });
});
