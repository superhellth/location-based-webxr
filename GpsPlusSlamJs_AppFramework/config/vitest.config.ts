import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Resolve `gps-plus-slam-js` to its in-monorepo source rather than the
  // built `dist/`. Not load-bearing for license activation — `src/test-setup.ts`
  // calls the public `validateLicenseKey()`, which activates whichever
  // module instance is resolved at runtime regardless of source vs. dist.
  // The alias is kept for fast iteration: framework tests pick up library
  // source changes without a `pnpm --filter gps-plus-slam-js build` step,
  // mirroring `GpsPlusSlamJs_Investigation`'s setup.
  resolve: {
    alias: {
      'gps-plus-slam-js': fileURLToPath(
        new URL('../../GpsPlusSlamJs/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: [
      fileURLToPath(new URL('../src/test-setup.ts', import.meta.url)),
    ],
    silent: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/index.ts'],
    },
  },
});
