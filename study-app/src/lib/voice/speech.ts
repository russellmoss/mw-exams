// Turn the Coach's markdown reply into clean prose for text-to-speech.
//
// The Coach formats for the eye — bold for the thing that matters, bullets one wine per line,
// blockquotes for examiner quotations, links to tier-1 sources. Spoken aloud those become
// "asterisk asterisk" noise and a read-out URL, so this strips the syntax and normalizes the
// units a wine answer is full of.
//
// Adapted from the Wine-inventory assistant's speech.ts. Two deliberate differences:
//
//   • NO PRONUNCIATION LEXICON. Theirs is ~340 lines tuned to cellar and lab vocabulary
//     (Saccharomyces, supplier names, lot codes) and it works by ElevenLabs phoneme tags, which
//     their own notes record as silently ignored by every model except flash v2/v3. We synthesize
//     with turbo_v2_5, so those rules would look configured and change nothing. If MW vocabulary
//     ("Gewürztraminer", "Pouilly-Fuissé") turns out to read badly, the lever is alias RESPELLING,
//     not phonemes.
//   • NO CITATION-LINK RULE. Theirs drops /kb/source/ links as attribution noise. The Coach's links
//     are tier-1 web sources whose LABEL is usually the sentence's subject ("the AWRI notes…"), so
//     labels are kept and only the bare URL is dropped.
//
// Pure, dependency-free, isomorphic: the client runs it before POSTing each sentence, and the
// speak route runs it again defensively. That double application is why every transform here must
// be idempotent.

function stripInline(text: string): string {
  let out = text;
  // Images before links, so "![alt](url)" isn't half-eaten by the link rule.
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links keep their label and lose their target — the label is part of the sentence.
  out = out.replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1");
  // A bare URL is never speakable.
  out = out.replace(/\bhttps?:\/\/\S+/gi, "");
  // Bold/italic: **x**, __x__, *x*, _x_ -> x
  out = out.replace(/(\*\*|__)(.*?)\1/g, "$2");
  out = out.replace(/(\*|_)(.*?)\1/g, "$2");
  // Inline code: `x` -> x (fenced blocks are removed in a whole-string pre-pass)
  out = out.replace(/`([^`]+)`/g, "$1");
  // Strikethrough ~~x~~ -> x
  out = out.replace(/~~(.*?)~~/g, "$1");
  return out;
}

/**
 * Wine units, spelled out.
 *
 * ORDER MATTERS throughout: the most specific pattern must win first, or "mg/L" gets half-eaten by
 * the "g/L" rule. `\s*` everywhere because the model writes "g / L" as readily as "g/L".
 */
function normalizeUnits(text: string): string {
  let out = text;

  // Residual sugar, acidity, SO2 — the three numbers an MW answer quotes constantly. Read as
  // letters-and-a-slash ("gee slash el") they are unusable.
  out = out.replace(/\bmg\s*\/\s*L\b/gi, "milligrams per litre");
  out = out.replace(/\bg\s*\/\s*hL\b/gi, "grams per hectolitre");
  out = out.replace(/\bmL\s*\/\s*L\b/gi, "millilitres per litre");
  out = out.replace(/\bg\s*\/\s*L\b/gi, "grams per litre");
  out = out.replace(/\bppm\b/gi, "parts per million");
  // "SO2" / "SO₂" would be spoken as letters. A trailing \b does NOT work — "₂" (U+2082) is not a
  // word character, so there is no boundary between it and a following space.
  out = out.replace(/\bSO\s*(?:2|₂)(?![A-Za-z0-9])/g, "sulphur dioxide");
  out = out.replace(/\bTA\b/g, "titratable acidity");

  // Brix, for the ripeness discussions.
  out = out.replace(/(\d)\s*°?\s*Bx\b/gi, "$1 Brix");
  out = out.replace(/°\s*Bx\b/gi, "Brix");

  // Temperatures before the bare-degree rule (those have a word char after "°").
  out = out.replace(/(\d)\s*°\s*C\b/g, "$1 degrees Celsius");
  out = out.replace(/(\d)\s*°\s*F\b/g, "$1 degrees Fahrenheit");
  out = out.replace(/(\d)\s*°(?!\w)/g, "$1 degrees");
  // "13.5%" must not come out as "thirteen point five".
  out = out.replace(/\s*%/g, " percent");

  return out;
}

/**
 * Exam shorthand, expanded.
 *
 * The Coach writes "2019 P2 Q3" and "MW" constantly. Spoken as letters that is "pee two cue three",
 * which is exactly how a candidate says it out loud — so P/Q are LEFT ALONE deliberately. What does
 * need help is the paper reference reading as a bare number run, and the mark notation.
 */
function normalizeExamShorthand(text: string): string {
  let out = text;
  // "4 x 10 marks" -> "4 by 10 marks". The multiplication sign and a bare "x" both read badly.
  out = out.replace(/(\d)\s*[x×]\s*(\d+)\s*marks\b/gi, "$1 by $2 marks");
  // "P1"/"p1" as a standalone token -> "Paper 1". Bounded so it cannot eat "P1_w3" style ids.
  out = out.replace(/\bP([123])\b/g, "Paper $1");
  return out;
}

/**
 * Convert Coach markdown into plain text suitable for TTS. Removes markdown syntax, list markers
 * and headings; normalizes wine units and exam shorthand; collapses whitespace. Sentence
 * punctuation is preserved so downstream chunking and prosody stay intact.
 */
export function toSpeakable(markdown: string): string {
  // Whole-string pre-pass: fenced code blocks span multiple lines, so unwrap them to their inner
  // content before splitting line by line.
  const defenced = (markdown ?? "").replace(/```[a-zA-Z0-9]*\n?([\s\S]*?)```/g, "$1");
  const lines = defenced.split(/\r?\n/);
  const cleaned = lines.map((raw) => {
    let line = raw;
    line = line.replace(/^\s{0,3}#{1,6}\s+/, ""); // "## Title" -> "Title"
    line = line.replace(/^\s{0,3}>\s?/, ""); // "> quote" -> "quote"
    line = line.replace(/^\s*[-*+]\s+/, ""); // "- item" -> "item"
    line = line.replace(/^\s*\d+[.)]\s+/, ""); // "1. item" -> "item"
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) line = ""; // horizontal rule
    return stripInline(line).trim();
  });

  const joined = cleaned.filter((l) => l.length > 0).join(". ");
  const tidied = joined
    // ".. " or " . " artifacts from joining lines that already end in punctuation.
    .replace(/([.!?]):?\s*\.\s/g, "$1 ")
    // Removing a URL leaves a gap before the punctuation it sat in front of.
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalizeExamShorthand(normalizeUnits(tidied));
}
