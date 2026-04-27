# `test-setup.ts`

## Purpose

Process-wide vitest setup file for `gps-plus-slam-app-framework`. Activates
the `gps-plus-slam-js` library once at the start of the test process so any
public API (reducers, action creators, selectors, math helpers like
`calcGpsCoords`, visualization helpers like `RefPointVisualizer`) is
callable from framework tests without each test manually constructing a
store via `createRecorderStore()` / `createGpsSlamStore({ licenseKey })`.

## Public API

None — this file is loaded by vitest via
`config/vitest.config.ts#test.setupFiles` and runs for its side effect only.

## Invariants & assumptions

- Uses the public `validateLicenseKey()` API exported from
  `gps-plus-slam-js`, with the bundled `COMMUNITY_LICENSE_KEY` from
  `./licensing/community-license-key` — exercising the real activation code
  path (signature verification + expiry check).
- Same pattern as RecorderApp's integration tests
  (`GpsPlusSlamJs_RecorderApp/src/state/recording-replay.integration.test.ts`).
- `config/vitest.config.ts` aliases `gps-plus-slam-js` → source for fast
  iteration (no rebuild needed). The alias is **not** load-bearing for
  activation — `validateLicenseKey()` activates whichever module instance is
  resolved at runtime, by definition. Activation works equally well against
  `dist/` if the alias is dropped.
- `COMMUNITY_LICENSE_KEY` carries a rolling 12-month expiration and is
  renewed each release. If framework tests start failing with
  `license expired`, regenerate via the key-rotation tooling shipped with
  `gps-plus-slam-js`.

## Examples

Loaded automatically — no usage by hand. Verification is implicit: every
gated framework test that previously failed with `license not activated`
(e.g. `src/utils/fused-path.test.ts`,
`src/visualization/reference-points.test.ts`,
`src/state/store-subscribers.test.ts`) now passes.

## Tests

This file has no dedicated test. Its correctness is proven by the full
framework suite passing.
