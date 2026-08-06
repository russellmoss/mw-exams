import { getUser } from "@/lib/auth";
import { getUserLiveTastingPrefs, setUserLiveTastingPrefs } from "@/lib/db";

export const runtime = "nodejs";

// One route for the related cluster (city/country/budget/currency), following the
// pace-preference precedent of one route owning multiple coupled columns.

const CURRENCIES = new Set(["USD", "EUR", "GBP"]);

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
    return Response.json(await getUserLiveTastingPrefs(user.id));
  } catch {
    return Response.json({ city: null, country: null, budgetAmount: null, budgetCurrency: null });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const body = await request.json();
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
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

    const prefs = { city, country, budgetAmount, budgetCurrency };
    await setUserLiveTastingPrefs(user.id, prefs);
    return Response.json(prefs);
  } catch {
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
