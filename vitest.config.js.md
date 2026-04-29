# vitest.config.js (root)

## Purpose

Vitest configuration for **root-level repo-meta tests only**. Per-package tests still run via each workspace's own vitest config (e.g. [`GpsPlusSlamJs_AppFramework/config/vitest.config.ts`](GpsPlusSlamJs_AppFramework/config/vitest.config.ts)).

## Public API

Default-exports a Vitest config object. Consumed by `pnpm run test:repo-config`.

## Invariants

- `include` is restricted to `tests/**/*.test.js` — root-level vitest must not pick up workspace-package tests, which have their own runners and configs.
- `environment: 'node'` because every repo-meta test reads files from disk; nothing here needs a DOM.

## Examples

```bash
pnpm run test:repo-config           # one-shot
pnpm exec vitest --config vitest.config.js  # watch mode
```

## Tests

Currently exercises `tests/repo-config/cla-config.test.js` (CLA artifact consistency). Future repo-meta tests can land under `tests/**/*.test.js` and will be picked up automatically.
