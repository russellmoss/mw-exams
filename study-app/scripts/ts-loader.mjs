// ESM resolver hook: lets Node (with native TS type-stripping) resolve the extensionless
// relative imports used across the app's .ts libs (e.g. `from "./wine-bank-lookup"`).
// Used by remediate-questions.mjs:  node --import ./scripts/ts-loader.mjs scripts/remediate-questions.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
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
