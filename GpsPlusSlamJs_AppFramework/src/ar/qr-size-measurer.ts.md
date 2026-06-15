# qr-size-measurer.ts

## Purpose

The composable depth→size piece shared by the QR demo and (next) the Recorder
(framework-wiring-options Part B, Option 2). Wraps the per-detection depth
sampling + the per-marker running-median accumulator that used to live inside
the demo controller, so each app wires **one measurer** instead of
re-implementing the loop.

## Public API

- `createQrSizeMeasurer(options?: QrSizeAccumulatorOptions): QrSizeMeasurer`
  - `measure(text, corners: Point2[], image: {width,height}, ctx): QrSizeMeasurement | null`
    — samples depth at the 4 corners + the centroid, runs
    `estimateQrSizeFromDepth`, folds the observation into the per-`text`
    accumulator, returns the updated estimate **plus** the raw corner/interior
    depth samples. `null` only when corner depth can't be sampled (a corner
    lacks depth, or `corners.length !== 4`). A degenerate quad is NOT a failure
    here — the null observation just isn't accumulated.
  - `current(text): QrSizeEstimate` — estimate without adding a sample.
  - `reset(text?)` — clear one marker (or all).
- `QrSizeDepthContext` — `{ depthAt, unprojector }` (a subset of the demo's
  `DepthContext`).
- `QrSizeMeasurement` — `{ estimate, cornerSamples, interiorSamples }`.
- `ImageSize` — `{ width, height }`.

## Invariants & assumptions

- **Pose-agnostic by design.** It returns `cornerSamples` so a depth-fit
  consumer (the demo) can unproject the SAME points for a pose without
  re-sampling; a PnP consumer (the Recorder) ignores them and reads only
  `estimate`. Promoting the rigid depth-corner _pose_ fit
  (`poseFromWorldCorners`) is the separate §3.3 follow-up.
- Accumulation is keyed by `text`; markers are independent.
- `options` flow to every per-marker `createQrSizeAccumulator` (quality
  threshold, min samples, spread cap, ring size).

## Examples

```ts
const measurer = createQrSizeMeasurer();
const m = measurer.measure(detection.text, detection.corners, image, depthCtx);
if (m && m.estimate.status === 'estimated') useSize(m.estimate.estimateM);
```

## Tests

- `qr-size-measurer.test.ts` — null on un-sampleable corners / wrong corner
  count, planar-square convergence to `estimated`, per-marker independence,
  `reset`/`current`. A fake unprojector maps normalized corners onto a planar
  square so the full pipeline runs without a device.
