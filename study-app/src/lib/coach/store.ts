// Conversation persistence.
//
// Kept out of src/lib/db.ts deliberately. That module is ~4,500 lines shared by every feature, and
// the Coach's storage is entirely self-contained — nothing outside src/lib/coach/ reads these tables.
// Co-locating them keeps the integrity surface reviewable in one directory.
//
// WHY THE THREAD IS PERSISTED AT ALL. A serverless function has no memory between requests, so
// multi-turn tool use is only possible if the exact Anthropic content blocks can be replayed. That
// is why `blocks` stores the raw array rather than a flattened string: a tool_use block that comes
// back without its tool_result pairing is an API error, not a degraded reply.

import { neon } from "@neondatabase/serverless";
import type Anthropic from "@anthropic-ai/sdk";

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export interface CoachMessageRow {
  id: number;
  role: "user" | "assistant";
  blocks: Anthropic.ContentBlockParam[] | null;
  text: string | null;
  tools_used: string[] | null;
  created_at: string;
}

function newConversationId(): string {
  return `cv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function createConversation(userId: number, title: string | null): Promise<string> {
  const sql = getDb();
  const id = newConversationId();
  await sql`
    INSERT INTO coach_conversations (id, user_id, title) VALUES (${id}, ${userId}, ${title})
  `;
  return id;
}

/**
 * Ownership check is a WHERE clause, not a separate read.
 *
 * Every conversation lookup filters on user_id. A conversation id is guessable enough that
 * "fetch then compare" would be a real hole, and this way there is no window between the two.
 */
export async function conversationExists(id: string, userId: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1 FROM coach_conversations WHERE id = ${id} AND user_id = ${userId} AND archived_at IS NULL
  `;
  return rows.length > 0;
}

export async function listConversations(userId: number, limit = 20) {
  const sql = getDb();
  return (await sql`
    SELECT id, title, created_at, updated_at
    FROM coach_conversations
    WHERE user_id = ${userId} AND archived_at IS NULL
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as { id: string; title: string | null; created_at: string; updated_at: string }[];
}

/**
 * How many past messages to replay into a turn.
 *
 * A window, not the whole thread: input tokens are re-sent every turn and the candidate is paying
 * for them under BYOK, so an unbounded thread turns a long conversation into a quietly escalating
 * bill. Twenty messages is roughly ten exchanges, which is past the point where earlier context
 * still matters for a study question.
 */
const REPLAY_WINDOW = 20;

export async function loadThread(conversationId: string): Promise<CoachMessageRow[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, role, blocks, text, tools_used, created_at
    FROM coach_messages
    WHERE conversation_id = ${conversationId}
    ORDER BY id DESC
    LIMIT ${REPLAY_WINDOW}
  `) as CoachMessageRow[];
  return rows.reverse();
}

/**
 * Rebuild Anthropic messages from stored rows.
 *
 * Only text is replayed, never the tool_use/tool_result pairs. Two reasons, and the second is the
 * important one: the pairs are large, and a window that happens to slice between a tool_use and its
 * tool_result produces a request the API rejects outright. Replaying the assistant's prose keeps the
 * conversation coherent while making the malformed-pair case impossible rather than unlikely.
 */
export function toAnthropicMessages(rows: CoachMessageRow[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const r of rows) {
    const text = (r.text || "").trim();
    if (!text) continue;
    out.push({ role: r.role, content: text });
  }
  return out;
}

export async function appendMessage(opts: {
  conversationId: string;
  role: "user" | "assistant";
  text: string;
  blocks?: Anthropic.ContentBlockParam[] | null;
  model?: string | null;
  attemptState?: string | null;
  toolsUsed?: string[];
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
}): Promise<number> {
  const sql = getDb();
  const u = opts.usage;
  const rows = await sql`
    INSERT INTO coach_messages (
      conversation_id, role, blocks, text, model, attempt_state, tools_used,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
    ) VALUES (
      ${opts.conversationId}, ${opts.role},
      ${opts.blocks ? JSON.stringify(opts.blocks) : null}::jsonb,
      ${opts.text}, ${opts.model ?? null}, ${opts.attemptState ?? null},
      ${opts.toolsUsed ?? []},
      ${u?.input ?? null}, ${u?.output ?? null}, ${u?.cacheRead ?? null}, ${u?.cacheWrite ?? null}
    ) RETURNING id
  `;
  await sql`UPDATE coach_conversations SET updated_at = NOW() WHERE id = ${opts.conversationId}`;
  return rows[0].id as number;
}

/**
 * A conversation's messages for display, newest last.
 *
 * Separate from loadThread, which windows to the last 20 for REPLAY into a model turn. This one is
 * for the reader: it returns more, and it returns message ids so the thumbs on an older reply still
 * work after the thread is reopened.
 */
export async function loadConversationForDisplay(conversationId: string, userId: number) {
  const sql = getDb();
  // The join to coach_conversations is the ownership check — a conversation id is guessable enough
  // that fetching first and comparing after would leave a window.
  const rows = (await sql`
    SELECT m.id, m.role, m.text, m.tools_used, m.attempt_state, m.created_at
    FROM coach_messages m
    JOIN coach_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ${conversationId} AND c.user_id = ${userId}
    ORDER BY m.id
    LIMIT 200
  `) as {
    id: number;
    role: "user" | "assistant";
    text: string | null;
    tools_used: string[] | null;
    attempt_state: string | null;
    created_at: string;
  }[];

  const ratings = (await sql`
    SELECT f.message_id, f.rating
    FROM coach_feedback f
    JOIN coach_messages m ON m.id = f.message_id
    WHERE m.conversation_id = ${conversationId} AND f.user_id = ${userId}
  `) as { message_id: number; rating: "up" | "down" }[];

  return { messages: rows, ratings };
}

/**
 * Archive rather than delete.
 *
 * The rows carry token counts and guard outcomes that are the only record of what the Coach actually
 * did on someone's key. Hiding a conversation from the list is what the user is asking for; erasing
 * the audit trail is not.
 */
export async function archiveConversation(conversationId: string, userId: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    UPDATE coach_conversations SET archived_at = NOW()
    WHERE id = ${conversationId} AND user_id = ${userId} AND archived_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Persist a capture alongside the message it was sent with.
 *
 * Stored so a bug report filed from this conversation can point at what the candidate was actually
 * looking at — the model's description of a screenshot is not evidence, the screenshot is. Base64 in
 * Postgres follows the existing precedent (media_cache.image_base64).
 */
export async function saveScreenshot(opts: {
  userId: number;
  conversationId: string;
  messageId: number;
  base64: string;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO coach_screenshots (user_id, conversation_id, message_id, image_base64, content_type, bytes)
    VALUES (${opts.userId}, ${opts.conversationId}, ${opts.messageId}, ${opts.base64}, 'image/png',
            ${Math.round((opts.base64.length * 3) / 4)})
  `;
}

/** Thumbs up/down. Re-rating the same message replaces the previous rating. */
export async function rateMessage(opts: {
  messageId: number;
  userId: number;
  rating: "up" | "down";
  comment: string | null;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO coach_feedback (message_id, user_id, rating, comment)
    VALUES (${opts.messageId}, ${opts.userId}, ${opts.rating}, ${opts.comment})
    ON CONFLICT (message_id, user_id)
    DO UPDATE SET rating = ${opts.rating}, comment = ${opts.comment}, created_at = NOW()
  `;
}

/**
 * Verify a message belongs to a conversation this user owns, before rating it.
 * Same reasoning as conversationExists — the join IS the authorisation.
 */
export async function messageBelongsToUser(messageId: number, userId: number): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    SELECT 1
    FROM coach_messages m
    JOIN coach_conversations c ON c.id = m.conversation_id
    WHERE m.id = ${messageId} AND c.user_id = ${userId}
  `;
  return rows.length > 0;
}
