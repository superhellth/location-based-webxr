import { defineConfig } from "vitest/config";

// Vitest scoping for the billboard demo: collect only the colocated `src` unit
// tests. The pure modules (billboard-math, playback-transport, panel-layout)
// are the unit-tested core; the Three.js/DOM view layer is exercised manually
// via the demo (`pnpm dev`).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
