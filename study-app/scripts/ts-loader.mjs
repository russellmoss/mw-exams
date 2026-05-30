// ESM resolver hook: lets Node (with native TS type-stripping) resolve the imports used
// across the app's .ts libs when run from a plain .mjs script:
//   • extensionless relative imports  (e.g. `from "./wine-bank-lookup"`)
//   • the `@/` path alias             (e.g. `from "@/lib/db"` → <cwd>/src/lib/db)
// Used by e.g.:  node --import ./scripts/ts-loader.mjs scripts/run-feedback-analysis.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { pathToFileURL } from "node:url";
      export async function resolve(spec, ctx, next) {
        // "@/x" maps to the app's src/ dir (tsconfig "@/*" -> "src/*"), resolved from cwd.
        if (spec.startsWith("@/")) {
          const base = pathToFileURL(process.cwd() + "/src/").href;
          const rest = spec.slice(2);
          for (const ext of ["", ".ts", ".tsx", ".js", "/index.ts"]) {
            try { return await next(base + rest + ext, ctx); } catch {}
          }
        }
        if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[a-jl-z][a-z0-9]*$/i.test(spec)) {
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            try { return await next(spec + ext, ctx); } catch {}
          }
        }
        return next(spec, ctx);
      }
    `),
  pathToFileURL("./").href
);
