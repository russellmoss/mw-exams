// Server-side loader + types for the /learn study chapters. Content is synced from the canonical
// outputs/learning_units/ into public/learning_units/ by scripts/sync-learning-units.mjs (prebuild).
// We read it from disk at request/build time. See outputs/learning_units/SCHEMA.md for the model.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONTENT_DIR = join(process.cwd(), "public", "learning_units");

export type Confidence = "confirmed" | "plausible";
export type Verdict = "pass" | "borderline" | "fail";
export type CalloutVariant = "key" | "warning" | "insight" | "note";

export interface Citation {
  id: string;
  type: string;
  claim?: string;
  source: string; // reader-facing only (NO-BACKSTAGE); internal `ref` is stripped at sync
  strength?: string;
}

// ── Block union ─────────────────────────────────────────────────────────────
interface BlockBase {
  type: string;
  sourceRefs?: string[];
}
export interface ProseBlock extends BlockBase {
  type: "prose";
  md: string;
}
export interface CalloutBlock extends BlockBase {
  type: "callout";
  variant?: CalloutVariant;
  title?: string;
  md: string;
}
export interface KeyTakeawayBlock extends BlockBase {
  type: "keytakeaway";
  md: string;
}
export interface TableBlock extends BlockBase {
  type: "table";
  columns: string[];
  rows: string[][];
  caption?: string;
}
export interface ExampleBlock extends BlockBase {
  type: "example";
  year?: number;
  paper?: number;
  question?: number;
  stem?: string;
  wine?: string;
  why?: string;
}
export interface ModelAnswerBlock extends BlockBase {
  type: "model-answer";
  label?: string;
  excerpt: string;
  annotation?: string;
}
export interface VisualBlock extends BlockBase {
  type: "visual";
  component: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  caption?: string;
}
export type Block =
  | ProseBlock
  | CalloutBlock
  | KeyTakeawayBlock
  | TableBlock
  | ExampleBlock
  | ModelAnswerBlock
  | VisualBlock;

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export interface Chapter {
  schemaVersion: number;
  chapter: number;
  slug: string;
  title: string;
  subtitle?: string;
  summary: string;
  estReadingMinutes?: number;
  anchorVisual?: string;
  status: string;
  sections: Section[];
  citations: Citation[];
}

export interface ChapterMeta {
  chapter: number;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  estReadingMinutes: number | null;
  anchorVisual: string | null;
  status: string;
  sectionCount: number;
}

export function getChapterIndex(): ChapterMeta[] {
  try {
    return JSON.parse(readFileSync(join(CONTENT_DIR, "index.json"), "utf8")) as ChapterMeta[];
  } catch {
    return [];
  }
}

export function getChapter(slug: string): Chapter | null {
  // guard against path traversal — slug is a single kebab-case segment
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return JSON.parse(readFileSync(join(CONTENT_DIR, `${slug}.json`), "utf8")) as Chapter;
  } catch {
    return null;
  }
}
