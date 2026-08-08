// Changing the app's voice from inside the conversation.
//
// WHY THIS ONE ACTS DIRECTLY, when every other mutating tool raises a confirmation card.
//
// The confirmation pattern in write-tools.ts exists because those writes reach past the candidate:
// a report lands in an admin queue, flag_defect pulls a question out of rotation for everyone. This
// one changes a display preference on the user's own account, takes effect in the next sentence
// they read, and is undone by saying so. The BASE prompt already forbids asking permission for
// something the candidate just asked for ("the card IS that question"), and "make yourself meaner"
// followed by a Confirm button is exactly the double-confirmation that rule is about.
//
// The residual risk is prompt injection — a corpus passage or a web result telling the model to
// switch personas. Worth naming, and small: the blast radius is the tone of the user's own app, it
// is announced in the reply that follows, and it reverts in one sentence. Set against a
// confirmation card on every "be blunter", that is the right trade. Nothing else in the Coach may
// copy this reasoning without the same analysis — see the guard in coach-integrity.test.ts, which
// pins the set of tools allowed to mutate without a card at exactly this one.

import { setUserPersona } from "@/lib/persona-server";
import { getPersona, isPersonaId, PERSONAS } from "@/lib/personas";
import type { CoachTool } from "../types";

export const setPersona: CoachTool = {
  name: "set_persona",
  // Not "write" — see the kind doc in types.ts. A write returns a proposal and is honoured by a
  // committer; this one mutates the caller's own setting directly and returns a result.
  kind: "preference",
  // Available mid-attempt: the whole point is that a candidate who is finding the voice grating
  // can stop it now, and "finish your question first" is an absurd answer to that.
  allowedWhenAttemptOpen: true,
  description:
    "Change the voice this app speaks to the candidate in — the Coach, their graded debriefs, and " +
    "the rulings on feedback they file. Call it whenever they ask for a different tone, in whatever " +
    "words: 'be blunter', 'stop congratulating me', 'can you be funnier', 'be nicer', 'go easy on " +
    "me', 'roast me'. Map what they asked for onto the closest persona rather than asking them to " +
    "pick from a menu. " +
    "The options are: " +
    PERSONAS.map((p) => `'${p.id}' (${p.name} — ${p.tagline})`).join(", ") +
    ". " +
    "It applies immediately, including to the rest of this reply. Do NOT ask for confirmation first " +
    "— they already asked. Afterwards, say what you switched to in one short line, in the NEW voice, " +
    "and mention it is also in Settings. " +
    "Only call this for a lasting change to how you talk. A one-off request about a single answer " +
    "('just give me the short version of this') is not a persona change — do that and leave the " +
    "setting alone.",
  inputSchema: {
    type: "object",
    properties: {
      persona: {
        type: "string",
        enum: PERSONAS.map((p) => p.id),
        description: "The voice to switch to.",
      },
    },
    required: ["persona"],
  },
  async run(ctx, input): Promise<{ ok: true; persona: string; instruction: string } | { error: string }> {
    const id = input.persona;
    if (!isPersonaId(id)) {
      return {
        error: `Unknown persona. Choose one of: ${PERSONAS.map((p) => p.id).join(", ")}.`,
      };
    }

    await setUserPersona(ctx.userId, id);
    const persona = getPersona(id);

    // The instruction matters as much as the flag. buildSystemBlocks re-reads the persona on the
    // next hop of this same turn, but the model has already produced tokens in the old voice, so
    // telling it explicitly to switch now is what stops the reply ending in the register it began.
    return {
      ok: true,
      persona: persona.id,
      instruction:
        `Voice changed to ${persona.name} — ${persona.tagline}. It is saved and applies everywhere: ` +
        `this chat, graded debriefs, and feedback rulings. Adopt it for the REST OF THIS REPLY, ` +
        `starting now. Tell them what you switched to in one short line, in the new voice, and that ` +
        `Settings has the full list.`,
    };
  },
};
