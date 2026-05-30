// Offline unit test for sync-empirical-knowledge.mjs op application (no DB/API).
// Feeds a synthetic ops object through applyOps against the real doc text and asserts the
// deterministic mutations landed correctly. Writes nothing.
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { applyOps } from "./sync-empirical-knowledge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.join(__dirname, "../../mw_exam_empirical_knowledge.md");
const docText = readFileSync(DOC, "utf8");

// figure out the current max EK id so we can assert the next assigned id
let max = 0;
for (const m of docText.matchAll(/^### EK-(\d+) /gm)) max = Math.max(max, Number(m[1]));
const expectId = `EK-${String(max + 1).padStart(4, "0")}`;

const ops = {
  items: [
    {
      attemptId: 999,
      newEntries: [
        {
          tempId: "NEW-1",
          section: 4,
          tier: "PLAUSIBLE",
          title: "TEST — synthetic distribution claim",
          evidence: ["ledger: attempt #999 / analysis #888 (accept)"],
          claim: "Synthetic test claim about wine distribution.",
          supersedes: "EK-0033",
        },
      ],
      supersede: [{ id: "EK-0033", byTempId: "NEW-1" }],
      ledgerRow: {
        attempt: 999,
        analysis: 888,
        paperFamily: "P3/F6",
        verdict: "accept",
        decided: "auto",
        taught: "synthetic | with a pipe to test escaping",
        ekRefs: ["NEW-1"],
      },
    },
  ],
};

const { text, created, summary } = applyOps(docText, ops, "incremental");

let pass = 0, fail = 0;
const ok = (name, cond) => (cond ? pass++ : (fail++, console.log("FAIL:", name)));

ok("assigned next EK id", created.length === 1 && created[0].id === expectId);
ok("new entry block present in doc", text.includes(`### ${expectId} · TEST — synthetic distribution claim`));
ok("new entry carries supersedes line (resolved)", text.includes(`- **supersedes:** ${expectId}`) === false && new RegExp(`### ${expectId} [\\s\\S]*?\\*\\*supersedes:\\*\\* EK-0033`).test(text));
ok("ledger row appended with resolved ref", text.includes(`| 999 | 888 | P3/F6 | accept | auto |`) && text.includes(`| ${expectId} |`));
ok("pipe in 'taught' was escaped", text.includes("synthetic / with a pipe to test escaping"));
ok("EK-0033 flipped to superseded", new RegExp(`### EK-0033 [\\s\\S]*?\\*\\*status:\\*\\* superseded \\(superseded by ${expectId}\\)`).test(text));
ok("changelog line added", new RegExp(`\\*\\*Changelog\\*\\*\\n- \\*\\*\\d{4}-\\d{2}-\\d{2} — incremental:`).test(text));
ok("no pre-existing EK id was dropped", [...docText.matchAll(/^### (EK-\d+) /gm)].every((m) => text.includes(m[1])));
ok("§ headings still intact (10 sections)", (text.match(/^## §\d+ /gm) || []).length === (docText.match(/^## §\d+ /gm) || []).length);

console.log(`\nsync op-application: ${pass} passed, ${fail} failed`);
console.log("summary line:", summary);
process.exit(fail ? 1 : 0);
