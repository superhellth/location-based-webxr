import { defineConfig } from "vitest/config";

// Vitest scoping for TourBuilder: collect the colocated tests under
// components/ (each component's pure `core/` plus node-runnable view-layer
// tests, e.g. the proximity replay e2e) and the shared contract in store/.
// Browser-only view layers are exercised manually via the demos (`pnpm dev`).
export default defineConfig({
  test: {
    include: ["components/**/*.test.ts", "store/**/*.test.ts"],
  },
});
