import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vitest needs the `@/` path alias resolved the same way Next resolves it (tsconfig `paths`).
 * Without this, importing any src module that itself imports `@/lib/...` fails at load time —
 * which forced test-only modules to use relative imports and kept src inconsistent.
 *
 * Everything else is left at Vitest's defaults on purpose, so adding this config doesn't change
 * which files run.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
});
