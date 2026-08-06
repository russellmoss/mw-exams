import { getUser } from "@/lib/auth";
import { getUserLiveTastingPrefs, setUserLiveTastingPrefs } from "@/lib/db";
import { geoFromHeaders } from "@/lib/geo";

export const runtime = "nodejs";

// One route for the related cluster (city/country/budget/currency), following the
// pace-preference precedent of one route owning multiple coupled columns.

const CURRENCIES = new Set(["USD", "EUR", "GBP"]);
const RADII = new Set([15, 30, 60, 90]);

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
    const prefs = await getUserLiveTastingPrefs(user.id);
    // detected = the IP-derived approximation (Vercel geo headers) — the create flow's fallback
    // when no market is saved. Advisory only; never persisted.
    return Response.json({ ...prefs, detected: geoFromHeaders(request.headers) });
  } catch {
    return Response.json({ city: null, state: null, country: null, budgetAmount: null, budgetCurrency: null, radiusMinutes: null });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const body = await request.json();
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
    const state = typeof body.state === "string" ? body.state.trim().slice(0, 80) : "";
    const country = typeof body.country === "string" ? body.country.trim().slice(0, 80) : "";
    if (!city || !country) {
      return Response.json({ error: "City and country are required" }, { status: 400 });
    }
    const rawAmount = Number(body.budgetAmount);
    const budgetAmount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.min(rawAmount, 100000) : null;
    const budgetCurrency =
      typeof body.budgetCurrency === "string" && CURRENCIES.has(body.budgetCurrency.trim().toUpperCase())
        ? body.budgetCurrency.trim().toUpperCase()
        : null;
    if (budgetAmount != null && budgetCurrency == null) {
      return Response.json({ error: "Budget needs a currency (USD, EUR or GBP)" }, { status: 400 });
    }

    const radiusMinutes = RADII.has(Number(body.radiusMinutes)) ? Number(body.radiusMinutes) : null;

    const prefs = { city, state: state || null, country, budgetAmount, budgetCurrency, radiusMinutes };
    await setUserLiveTastingPrefs(user.id, prefs);
    return Response.json(prefs);
  } catch {
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
