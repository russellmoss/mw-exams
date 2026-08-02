// Generates study-app/public/data/app-surface.json — a deploy-safe digest the Feature Request engine
// reads at runtime so its proposals + mockups never drift from the real app. Two things it pins:
//   1. tokensCss — the Cellar design tokens, derived from src/app/globals.css :root (so mockups match
//      the real theme automatically), plus mockup helper classes that reference those vars.
//   2. A structural inventory (routes / api routes / components / practice modes) scanned from the
//      filesystem, so a newly-added screen/mode shows up in the digest even if nobody updates prose.
// Runs in `prebuild`, so it regenerates on every local/Vercel/CI build. Deterministic (sorted, no
// timestamp) so a rebuild with unchanged source produces an identical file.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join, relative, dirname } from "path";

const SRC = "src/app";

// Mockup helper classes — reference the generated --vars so they track the theme. Body/heading fonts
// approximate Geist/Fraunces with system fonts (the Next font CSS vars don't resolve in a sandboxed
// iframe). Kept here so the generated tokensCss is self-contained.
const HELPERS = `
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--foreground);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:24px;font-size:14px;line-height:1.5}
h1,h2,h3{font-family:Georgia,'Times New Roman',serif;font-weight:600;letter-spacing:-.01em;margin:0 0 .5em}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
.btn{background:var(--accent);color:var(--background);border:none;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:8px;padding:10px 18px}
.muted{color:var(--muted)} .accent{color:var(--accent)}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:2px 6px;border-radius:4px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}
input,textarea,select{background:var(--background);border:1px solid var(--border);border-radius:8px;color:var(--foreground);padding:10px;width:100%;font-family:inherit}`;

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

const norm = (p) => p.replace(/\\/g, "/");

// Pages → route paths (strip route groups "(x)"; keep dynamic "[x]").
const pages = walk(SRC, (p) => norm(p).endsWith("/page.tsx")).filter((p) => !norm(p).includes("/api/"));
const routes = [
  ...new Set(
    pages.map((f) => {
      const dir = norm(relative(SRC, f)).replace(/(^|\/)page\.tsx$/, "");
      if (dir === "" || dir === ".") return "/";
      const segs = dir.split("/").filter((s) => !(s.startsWith("(") && s.endsWith(")")));
      return "/" + segs.join("/");
    })
  ),
].sort();

const apiRoutes = [
  ...new Set(
    walk(join(SRC, "api"), (p) => norm(p).endsWith("/route.ts")).map(
      (f) => "/api/" + norm(relative(join(SRC, "api"), f)).replace(/\/route\.ts$/, "")
    )
  ),
].sort();

const compDir = join(SRC, "components");
const components = existsSync(compDir)
  ? readdirSync(compDir).filter((f) => f.endsWith(".tsx")).map((f) => f.replace(/\.tsx$/, "")).sort()
  : [];

// Practice modes from the StudyMode union in the landing page.
let modes = [];
try {
  const pg = readFileSync(join(SRC, "page.tsx"), "utf8");
  const m = pg.match(/type StudyMode\s*=\s*([^;]+);/);
  if (m) modes = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
} catch {}

// Cellar tokens from globals.css :root — the DARK block, which is the default and native theme.
//
// The light theme (2026-08-02) turned the bare `:root {` selector into the list
// `:root, :root[data-theme="dark"] {`, which a `/:root\s*{/` match no longer sees — so this
// silently produced an empty token set and every consumer of the digest (notably the Feature
// Request builder's prompt) lost the palette. Match the dark block explicitly, and keep the bare
// `:root` fallback for any globals.css that predates the light theme.
let tokensCss = "";
try {
  const css = readFileSync(join(SRC, "globals.css"), "utf8");
  const root =
    css.match(/:root[^{]*\[data-theme="dark"\][^{]*{([\s\S]*?)}/) ||
    css.match(/:root\s*{([\s\S]*?)}/);
  const decls = [];
  if (root) {
    for (const mm of root[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      decls.push(`  --${mm[1]}:${mm[2].trim()};`);
    }
  }
  tokensCss = `:root{\n${decls.join("\n")}\n}\n${HELPERS}`;
} catch {}

const out = { tokensCss, routes, apiRoutes, components, modes };
const outPath = join("public", "data", "app-surface.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`app-surface: ${routes.length} routes, ${apiRoutes.length} api, ${components.length} components, ${modes.length} modes, tokensCss ${tokensCss.length} chars → ${outPath}`);
