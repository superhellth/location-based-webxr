import { defineConfig } from "vitest/config";

// Vitest scoping for TourBuilder: collect the colocated tests under
// src/components/ (each component's pure `core/` plus node-runnable view-layer
// tests, e.g. the proximity replay e2e) and the shared contract in src/store/.
// Browser-only view layers are exercised manually via the demos (`pnpm dev`).
export default defineConfig({
  test: {
    include: ["src/components/**/*.test.ts", "src/store/**/*.test.ts"],
  },
});
