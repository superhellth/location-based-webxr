import { defineConfig } from 'vitest/config';

// Root-level vitest config — runs only repo-meta tests (e.g. CLA artifact
// consistency). Per-package tests still run via each workspace's own
// vitest config (e.g. GpsPlusSlamJs_AppFramework/config/vitest.config.ts).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
