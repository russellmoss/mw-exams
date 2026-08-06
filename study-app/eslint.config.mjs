import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Untracked local scratch. Not in a fresh checkout, so linting it makes a developer's local
    // result diverge from CI's — a stray .cjs in here once accounted for 37 of 50 reported errors,
    // none of which existed on the branch.
    ".tmp/**",
  ]),
]);

export default eslintConfig;
