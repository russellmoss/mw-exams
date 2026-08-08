import { getUser } from "@/lib/auth";
import { getUserPersona, setUserPersona } from "@/lib/persona-server";
import { DEFAULT_PERSONA, isPersonaId, PERSONAS } from "@/lib/personas";

export const runtime = "nodejs";

// The AI persona preference (migration 068). GET returns the saved choice plus the catalog the
// picker renders, so Settings needs one round trip — same shape as voice-preference.
//
// There is no "clear it" case, unlike the voice: the column is NOT NULL with a default, because
// every prompt builder needs a concrete voice and resolving null at seven call sites would be
// seven chances to disagree about what null means.

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    return Response.json({
      persona: await getUserPersona(user.id),
      defaultPersona: DEFAULT_PERSONA,
      personas: PERSONAS,
    });
  } catch (err) {
    console.error("GET persona error:", err);
    // Render the picker on the default rather than showing an error card — the setting is cosmetic
    // and a failed read should not look like a broken page.
    return Response.json({
      persona: DEFAULT_PERSONA,
      defaultPersona: DEFAULT_PERSONA,
      personas: PERSONAS,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const persona = body?.persona;
    if (!isPersonaId(persona)) {
      return Response.json(
        { error: `Unknown persona. Expected one of: ${PERSONAS.map((p) => p.id).join(", ")}.` },
        { status: 400 }
      );
    }

    await setUserPersona(user.id, persona);
    return Response.json({ persona });
  } catch (err) {
    console.error("PATCH persona error:", err);
    return Response.json({ error: "Failed to save persona" }, { status: 500 });
  }
}
