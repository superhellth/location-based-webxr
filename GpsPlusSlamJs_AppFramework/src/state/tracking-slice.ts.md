# tracking-slice.ts

## Purpose

Redux Toolkit slice for the AR tracking-loss / tracking-restart state machine. Ports the long-lived `TrackingStateManager` class (`ar/tracking-state.ts`) into a slice; see [2026-05-13-tracking-state-slice-port-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-tracking-state-slice-port-plan.md) for rationale and the full sub-step plan. Sub-step 2 (this file) ships the slice + selectors + tests only; the legacy class stays in place until sub-step 3 migrates the host and sub-step 4 deletes it.

## Public API

- Types
  - `TrackingPhase` — `'initializing' | 'tracking' | 'lost'`. String-literal union (not a TS enum) so the value is structurally compatible with JSON / replay payloads.
  - `TrackingSliceState` — slice shape (`phase`, `lastValidPose`, `lastSensorOrientation`, `lostFrameCount`, `originResetDuringLoss`, `resetTransform`, `lastRestartedPayload`).
  - `DeviceOrientation` — local copy of `RawDeviceOrientation`. Re-declared here so sub-step 4 can delete `ar/tracking-state.ts` without leaving dangling type re-exports.
  - `ResetTransformData` — serialized `XRReferenceSpaceEvent.transform` (position + orientation).
  - `PoseReceivedPayload` — `{ pose, sensorOrientation }`.
- Actions
  - `poseReceived({ pose, sensorOrientation })` — atomic pose + orientation snapshot. INITIALIZING|LOST → TRACKING. On LOST → TRACKING with `originResetDuringLoss === true && lastValidPose !== null`, populates `lastRestartedPayload`.
  - `poseLost()` — increments `lostFrameCount`; TRACKING → LOST on first call.
  - `originReset(transform?)` — flags origin reset (only while LOST); accepts `ResetTransformData`, `null`, or omitted (= `undefined`). The three values are preserved literally.
  - `resetTracking()` — returns to initial state.
  - `clearLastRestartedPayload()` — host calls after consuming `lastRestartedPayload`.
- Reducer: `trackingReducer` (mounted as `tracking` in `createSlamAppStore`).
- Selectors: `selectTrackingPhase`, `selectLastValidPose`, `selectLostFrameCount`, `selectLastRestartedPayload`.

## Invariants & Assumptions

- `lostFrameCount` is non-negative (property test). Reset to 0 on every `poseReceived`.
- `originResetDuringLoss` is only `true` while `phase === 'lost'` (property test). The reducer clears it on the LOST → TRACKING transition together with `resetTransform`.
- `originReset` while not LOST is a no-op (the manager had the same guard).
- `lastValidPose` is `null` until the first `poseReceived` (property test).
- `lastRestartedPayload` is **transient**: the host must call `clearLastRestartedPayload` between cycles. A subsequent **Case 1** (seamless) recovery does NOT clobber an unread payload; a consecutive **Case 2** (relocalization) recovery overwrites it. Both behaviours are pinned by tests.
- The `null lastValidPose` defensive branch on LOST → TRACKING-with-reset cannot be hit through the public API (because `lastValidPose` is set atomically alongside `lastSensorOrientation`), but is preserved for parity with the manager and exercised via preloaded state.
- The slice carries **no side effects** — the host translates phase transitions into `onTrackingLost` / `onTrackingRestarted` / `onTrackingRecovered` callbacks via `subscribeToSelector` in sub-step 3.

## Examples

```ts
import { configureStore } from '@reduxjs/toolkit';
import {
  trackingReducer,
  poseReceived,
  poseLost,
  originReset,
  selectLastRestartedPayload,
} from 'gps-plus-slam-app-framework';

const store = configureStore({ reducer: { tracking: trackingReducer } });

// New frame with a valid pose:
store.dispatch(
  poseReceived({
    pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    sensorOrientation: { alpha: 90, beta: 0, gamma: 0, absolute: true },
  })
);

// Tracking lost + relocalization:
store.dispatch(poseLost());
store.dispatch(originReset({ position: [0, 0, 0], orientation: [0, 0, 0, 1] }));
store.dispatch(
  poseReceived({
    pose: { position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    sensorOrientation: { alpha: 90, beta: 0, gamma: 0, absolute: true },
  })
);

const payload = selectLastRestartedPayload(store.getState());
// → OdometryTrackingRestartedPayload with both poses + both sensor orientations.
```

## Tests

- [tracking-slice.test.ts](tracking-slice.test.ts) — 30 unit tests translated 1:1 from the legacy `TrackingStateManager` test matrix (initial state, every transition, Case 1 vs. Case 2 split, transient payload lifecycle, `resetTracking`).
- [tracking-slice.property.test.ts](tracking-slice.property.test.ts) — 6 property tests pinning the state-machine invariants under random `[poseReceived, poseLost, originReset, clearLastRestartedPayload]` walks.
- Coverage: 100% statements / branches / functions / lines on this file.

## Related

- [2026-05-13-tracking-state-slice-port-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-tracking-state-slice-port-plan.md) — port plan and sub-step roadmap (this file ships sub-step 2).
- [2026-05-07-csharp-features-not-yet-ported.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-07-csharp-features-not-yet-ported.md) — survey doc, P2 step 2.
- [tracking-state.ts](../ar/tracking-state.ts.md) — legacy class being replaced; stays in place until sub-step 4.
- [create-slam-app-store.ts](create-slam-app-store.ts) — mounts `trackingReducer` under `state.tracking`.
- [recording-slice.ts](recording-slice.ts.md) — sibling slice following the same pattern.
