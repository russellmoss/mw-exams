import { getUser } from "@/lib/auth";
import {
  getBankSliceItemsByColumn,
  getKeptBankLite,
  type BankSliceItemRow,
  type ReviewStateFilter,
} from "@/lib/db";
import { parseWines, deriveGrapes, deriveRegions, deriveMarkFocus } from "@/lib/bank-health/derive";
import { parsePaperParam } from "@/lib/bank-health/paper-param";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Slice → the indexed column it filters on, or null for the TypeScript-derived slices.
const COLUMN_FOR_SLICE: Record<string, "paper" | "question_type" | "curveball" | "price_band" | "flight_size" | null> = {
  paper: "paper",
  questionType: "question_type",
  curveball: "curveball",
  priceBand: "price_band",
  flightSize: "flight_size",
  grapeCoverage: null,
  overRepetition: null,
  regionCoverage: null,
  markFocus: null,
};

interface SliceItem {
  id: string;
  paper: number;
  questionNumber: number | null;
  stemSnippet: string;
  wines: string[];
  marks: number;
  served: boolean;
  reviewed: boolean;
  createdAt: string;
}

function toItem(row: BankSliceItemRow): SliceItem {
  const wines = parseWines(row.wines).map((w) => w.fullText || "").filter(Boolean);
  const stem = (row.question_text || "").replace(/\s+/g, " ").trim();
  const numMatch = /question\s+(\d+)/i.exec(row.question_text || "");
  return {
    id: row.question_id,
    paper: row.paper,
    questionNumber: numMatch ? Number(numMatch[1]) : null,
    stemSnippet: stem.length > 140 ? `${stem.slice(0, 140)}…` : stem,
    wines,
    marks: row.total_marks,
    served: (row.times_served ?? 0) > 0,
    reviewed: !!row.reviewed,
    createdAt: row.created_at,
  };
}

// Predicate for the derived (free-text) slices.
function derivedMatch(slice: string, key: string, row: BankSliceItemRow): boolean {
  if (slice === "grapeCoverage" || slice === "overRepetition") {
    return deriveGrapes(row.wines).includes(key);
  }
  if (slice === "regionCoverage") {
    return deriveRegions(row.wines).includes(key);
  }
  if (slice === "markFocus") {
    const focus = deriveMarkFocus(row.question_text || "", row.total_marks);
    return (focus[key as keyof typeof focus] || 0) > 0;
  }
  return false;
}

/**
 * GET /api/admin/bank-health/slice?slice=<id>&key=<key>&limit=50&cursor= — admin-only.
 *
 * The individual banked questions inside one slice bucket, newest first, paginated by an opaque
 * offset cursor. Column-backed slices page in SQL; the TypeScript-derived slices filter a single
 * lite scan of the servable pool.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const slice = url.searchParams.get("slice") || "";
  const key = url.searchParams.get("key") || "";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
  const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
  // Batch Undo: "Never reviewed" filter chip. Unknown values fall back to 'all'.
  const rawFilter = url.searchParams.get("reviewStateFilter");
  const reviewStateFilter: ReviewStateFilter =
    rawFilter === "reviewed" || rawFilter === "never" ? rawFilter : "all";
  // Bank Health paper filter: scope the drill-down to a single paper (absent = all).
  const paper = parsePaperParam(url.searchParams.get("paper"));
  if (paper === "invalid") {
    return Response.json({ error: "Invalid paper" }, { status: 400 });
  }

  if (!(slice in COLUMN_FOR_SLICE) || !key) {
    return Response.json({ error: "Missing or unknown slice/key" }, { status: 400 });
  }

  const column = COLUMN_FOR_SLICE[slice];

  if (column) {
    // Fetch one extra to know whether another page exists.
    const rows = await getBankSliceItemsByColumn(column, key, limit + 1, cursor, reviewStateFilter, paper);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toItem);
    return Response.json({ items, nextCursor: hasMore ? String(cursor + limit) : null });
  }

  // Derived slice: filter the lite scan, sort newest-first, page by offset.
  const lite = await getKeptBankLite(paper);
  const matched = lite
    .filter((r) => derivedMatch(slice, key, r))
    .filter((r) =>
      reviewStateFilter === "reviewed" ? r.reviewed
        : reviewStateFilter === "never" ? !r.reviewed
        : true
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const page = matched.slice(cursor, cursor + limit);
  const hasMore = cursor + limit < matched.length;
  return Response.json({
    items: page.map(toItem),
    nextCursor: hasMore ? String(cursor + limit) : null,
  });
}
