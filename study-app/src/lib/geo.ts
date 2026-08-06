/**
 * IP-based location approximation for Live Tasting (user-1 request, 2026-08-06).
 *
 * Vercel stamps every production request with geo headers derived from the client IP —
 * x-vercel-ip-city (URI-encoded), x-vercel-ip-country (ISO-2), x-vercel-ip-country-region
 * (e.g. "PA") — so no external geolocation service is needed. Used ONLY as a per-session
 * fallback when the user has no market saved: IP geo is wrong under VPNs and travel, so it is
 * never written to the users table, and the UI labels it "approximate".
 *
 * The US region code is appended to the city ("New Hope, PA") because the availability ladder's
 * control-state detection and the stockist-parse prompt both key off state tokens in the city
 * string. Country codes map to the display names the mail-order ladder and judge prompts use.
 */

export type DetectedLocation = { city: string; country: string; approximate: true };

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  IE: "Ireland",
  CH: "Switzerland",
  AT: "Austria",
  ES: "Spain",
  IT: "Italy",
  PT: "Portugal",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
};

export function geoFromHeaders(headers: Headers): DetectedLocation | null {
  const rawCity = headers.get("x-vercel-ip-city");
  const countryCode = (headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  if (!rawCity || !countryCode) return null; // local dev / non-Vercel: no fallback

  let city: string;
  try {
    city = decodeURIComponent(rawCity).trim();
  } catch {
    city = rawCity.trim();
  }
  if (!city) return null;

  const region = (headers.get("x-vercel-ip-country-region") || "").trim();
  if (countryCode === "US" && region) city = `${city}, ${region}`;

  return {
    city,
    country: COUNTRY_NAMES[countryCode] ?? countryCode,
    approximate: true,
  };
}
