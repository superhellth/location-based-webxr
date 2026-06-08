# `boot.test.ts` — headless boot smoke test

## Purpose

Codifies the minimal example's only **hardware-free** coverage: that the
`gps-plus-slam-app-framework` + closed-core packages resolve and a
`createSlamAppStore({ storageBackend: new NullStorageBackend() })` boots into a
sane initial state. This replaces the old "run `pnpm dev` and watch it boot"
manual check (Decision-A smoke-test follow-up, §5 Step 0 of the plan doc), so the
later AR reshape (Step 2 — whose WebXR glue is only verifiable on-device) does not
silently drop the last piece of CI-runnable coverage.

## What it asserts

- `createSlamAppStore` returns a store with `getState`/`subscribe`.
- Initial `recording` slice is idle/empty (`isRecording=false`, `actionCount=0`,
  `failedWriteCount=0`).
- `selectGpsPositions` returns `[]` before any GPS fix.

## Invariants & assumptions

- Runs in the default vitest (node) environment — no DOM, no WebXR, no AR
  hardware. Only the pure store/selector boundary is exercised.
- The structural cast through `unknown` for `selectGpsPositions` mirrors
  [main.ts](./main.ts) (the selector is typed against the framework's internal
  `CombinedRootState` but only reads `gpsData`).

## Related

- [main.ts](./main.ts) — the example wiring this protects.
- Plan: `GpsPlusSlamJs_Docs/docs/2026-06-03-threejs-arbutton-minimal-ar-example-user-feedback.md`
  §5 Step 0.
