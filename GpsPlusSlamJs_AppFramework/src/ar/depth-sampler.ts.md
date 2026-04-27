# Depth Sampler

## Purpose

Samples sparse depth points from the WebXR depth sensing API at a configurable interval (~1 Hz default). Captures a grid of depth values with the camera pose for 3D reconstruction and validation.

## Public API

### `DepthSampler` (class)

- **`constructor(callbacks: DepthSamplerCallbacks, config?: Partial<DepthSamplerConfig>)`** — creates a sampler with event callbacks and optional config overrides.
- **`start(): void`** — begins sampling; resets counters and timers.
- **`stop(): void`** — stops sampling.
- **`isRunning(): boolean`** — returns whether sampling is active.
- **`getSampleCount(): number`** — number of samples captured since last `start()`.
- **`getConfig(): DepthSamplerConfig`** — returns a copy of the current config.
- **`onFrame(timestamp: number, depthInfo: DepthInfo | null): void`** — call once per XR frame. Throttles sampling to `intervalMs`.

### Interfaces

- **`DepthSamplerConfig`** — `{ intervalMs, gridSize, unavailabilityThresholdMs }`
- **`DepthSamplerCallbacks`** — `{ onSampleCaptured, getCurrentPose, onDepthUnavailable? }`
- **`DepthInfo`** — subset of `XRDepthInformation`: `{ width, height, getDepthInMeters }`

## Invariants & Assumptions

1. **NUE coordinate convention** — `cameraPos` in each `DepthSample` is converted from WebXR (X=East, Y=Up, Z=South) to NUE (X=North, Y=Up, Z=East) via `extractOdomPosition()`.
2. **Epoch-ms timestamps** — `timestamp` in `DepthSample` is `performance.timeOrigin + xrFrameTime`, matching all other persisted action timestamps (GPS events, images, reference points).
3. **Camera rotation is raw WebXR** — `cameraRot` quaternion `[x, y, z, w]` is taken directly from `ARPose.orientation` (no NUE conversion for rotations).
4. **Interval gating** — successive samples require at least `intervalMs` between them; intervening frames are skipped.
5. **Pose required** — if `getCurrentPose()` returns null the frame is silently skipped.
6. **Unavailability detection** — if no depth data arrives within `unavailabilityThresholdMs` of `start()`, `onDepthUnavailable` fires once.

## Examples

```ts
const sampler = new DepthSampler({
  onSampleCaptured: (sample) => store.dispatch(recordDepthSample(sample)),
  getCurrentPose: () => xrSession.getCurrentPose(),
});
sampler.start();
// In XR frame loop:
sampler.onFrame(xrFrame.predictedDisplayTime, depthInfo);
```

## Tests

- `depth-sampler.test.ts` — 30 tests covering:
  - Lifecycle (start/stop/isRunning)
  - Interval throttling
  - Grid sampling at various sizes
  - Pose unavailability handling
  - Depth unavailability detection and callback
  - NUE coordinate conversion for cameraPos
  - Epoch-ms timestamp conversion
