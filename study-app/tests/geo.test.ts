import { describe, it, expect } from "vitest";
import { geoFromHeaders } from "@/lib/geo";
import { controlStateDomain } from "@/lib/retail-availability";

const h = (entries: Record<string, string>) => new Headers(entries);

describe("geoFromHeaders — the IP-location fallback", () => {
  it("decodes the city, appends the US state, and maps the country name", () => {
    const d = geoFromHeaders(h({
      "x-vercel-ip-city": "New%20Hope",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "PA",
    }));
    expect(d).toEqual({ city: "New Hope, PA", country: "United States", approximate: true });
  });

  it("the detected city drives control-state detection (the whole point of the PA suffix)", () => {
    const d = geoFromHeaders(h({
      "x-vercel-ip-city": "Philadelphia",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "PA",
    }))!;
    expect(controlStateDomain(d.city, d.country)).toBe("finewineandgoodspirits.com");
  });

  it("non-US countries skip the region suffix and map to display names", () => {
    expect(geoFromHeaders(h({ "x-vercel-ip-city": "London", "x-vercel-ip-country": "GB", "x-vercel-ip-country-region": "ENG" })))
      .toEqual({ city: "London", country: "United Kingdom", approximate: true });
  });

  it("unknown ISO codes pass through; missing headers yield null (local dev)", () => {
    expect(geoFromHeaders(h({ "x-vercel-ip-city": "Oslo", "x-vercel-ip-country": "NO" }))?.country).toBe("NO");
    expect(geoFromHeaders(h({}))).toBeNull();
    expect(geoFromHeaders(h({ "x-vercel-ip-country": "US" }))).toBeNull();
  });
});
