/**
 * Paper QA LOOP — runs the paper-QA harness across papers 1/2/3 in parallel, for N rounds, and
 * reports a per-paper PASS RATE plus the deduplicated judge findings.
 *
 * Why a loop: the examiner judge is stochastic, so a single pass (or a single failure) is weak
 * evidence. What matters is the rate and WHICH findings repeat — a finding that appears in most
 * rounds is a real convention gap; one that appears once is judge noise.
 *
 * Usage: node scripts/paper-qa-loop.mjs [rounds] [papers]
 *   node scripts/paper-qa-loop.mjs 3 1,2,3
 *
 * Env: BASE_URL (defaults to the local dev server), DATABASE_URL, ANTHROPIC_API_KEY.
 * Each (round, paper) leg gets its OWN QA user so concurrent cleanups can't delete each other's
 * in-flight papers.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROUNDS = Number(process.argv[2] || 3);
const PAPERS = (process.argv[3] || "1,2,3").split(",").map((n) => Number(n.trim()));

function runLeg(paper, round) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      LT_QA_EMAIL: `lt-qa-loop-p${paper}-r${round}@bwc.test`,
      LT_E2E_PASSWORD: `loop-p${paper}r${round}-${Math.random().toString(36).slice(2, 10)}`,
    };
    const child = spawn(process.execPath, [join(HERE, "live-tasting-paper-qa.mjs"), "--paper", String(paper)], {
      env,
      cwd: join(HERE, ".."),
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", () => {
      const judge = {};
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^(PASS|FAIL)\s+judge (\w+)/);
        if (m) judge[m[2]] = m[1] === "PASS";
      }
      const structural = out.split(/\r?\n/).filter((l) => /^FAIL/.test(l) && !/judge/.test(l));
      const notesLine = out.split(/\r?\n/).find((l) => /^FAIL\s+judge/.test(l)) || "";
      const notes = notesLine.replace(/^FAIL\s+judge \w+ — /, "").trim();
      const dims = ["stem_style_authentic", "question_mix_realistic", "mark_structures_authentic", "would_pass_as_real"];
      const judged = dims.filter((d) => d in judge);
      const passed = judged.length === dims.length && dims.every((d) => judge[d]) && structural.length === 0;
      resolve({ paper, round, passed, judge, structural, notes, generated: /all flights generated/.test(out) });
    });
  });
}

const results = [];
for (let r = 1; r <= ROUNDS; r++) {
  console.log(`\n=== ROUND ${r}/${ROUNDS} — papers ${PAPERS.join(", ")} in parallel ===`);
  const legs = await Promise.all(PAPERS.map((p) => runLeg(p, r)));
  for (const leg of legs) {
    results.push(leg);
    const dims = Object.entries(leg.judge).map(([k, v]) => `${v ? "+" : "-"}${k.replace(/_authentic|_realistic/, "")}`).join(" ");
    console.log(`  P${leg.paper}: ${leg.passed ? "PASS" : "FAIL"} | ${dims}${leg.structural.length ? ` | structural: ${leg.structural.length}` : ""}`);
    for (const s of leg.structural) console.log(`     ✗ ${s.slice(0, 200)}`);
    if (!leg.passed && leg.notes) console.log(`     ↳ ${leg.notes.slice(0, 300)}`);
  }
}

console.log("\n================ SUMMARY ================");
for (const p of PAPERS) {
  const mine = results.filter((r) => r.paper === p);
  const passes = mine.filter((r) => r.passed).length;
  console.log(`Paper ${p}: ${passes}/${mine.length} passed`);
  const dims = ["stem_style_authentic", "question_mix_realistic", "mark_structures_authentic", "would_pass_as_real"];
  for (const d of dims) {
    const ok = mine.filter((r) => r.judge[d]).length;
    if (ok < mine.length) console.log(`   ${d}: ${ok}/${mine.length}`);
  }
  for (const r of mine.filter((x) => !x.passed && x.notes)) {
    console.log(`   note(r${r.round}): ${r.notes.slice(0, 260)}`);
  }
}
const total = results.filter((r) => r.passed).length;
console.log(`\nOVERALL: ${total}/${results.length} papers passed everything`);
process.exit(total === results.length ? 0 : 1);
