# wire-qr-recording.ts

## Purpose

Composes the live QR feature into a running AR session, gated by
`recordingOptions.qr.enabled`: the WS-2 **producer** (records RAW detections) and
the WS-5 **consumer** (debug axis+cube). `main.ts` calls it once in `handleEnterAR`
(after `arWorldGroup` exists) and disposes it on reset / re-entry.

## Public API

- `wireQrRecording(options) → dispose()`
  - `options.storeRef` — the active-store ref (producer + viz follow swaps).
  - `options.getArWorldGroup()` — parent for the debug objects.
  - `options.qr` — `{ enabled, intervalMs, captureSize }` (caller gates on `enabled`).
  - `options.setProducer(producer | null)` — receives the producer so the
    pre-`initAR` `setCameraFrameCallback` can forward frames to it.
  - returns a `dispose()` that stops capture, resets/clears the producer, detaches
    the debug subscriber + swap listener, and disposes the viz.

## Invariants & assumptions

- **Clock domain (load-bearing, open topic A):** the producer's `now` is pinned to
  `performance.now()` — the SAME clock the recorded depth stream uses — so the
  derive-on-read size as-of join pairs each detection with the right depth sample.
  The framework producer defaults to `Date.now()`; passing `performance.now` is
  mandatory.
- **Single cadence owner:** `startCameraFrameCapture({ intervalMs })` throttles;
  the producer runs `minIntervalMs: 0`.
- **Camera pose + projection** come from the latest recorded depth sample on the
  CURRENT store (mirrors the demo's verified post-detect read). The observation's
  `imageWidth/Height` come from the detector-frame buffer; note the two distinct
  projection matrices (open topic F).
- **Store-swap safe:** dispatches + reads go through `storeRef.get()`, and the
  debug subscriber re-attaches on every swap (Start Recording / replay).

## Tests

- `wire-qr-recording.test.ts` — producer clock is `performance.now()` not epoch;
  capture started with the configured cadence/size; producer handed to
  `setProducer`; camera pose/projection read from the latest depth sample;
  detections dispatch RAW into the current store; debug controller driven on change
  - re-attached across a swap; `dispose()` tears everything down. Framework
    producer/controller are mocked.

## Related

- [qr-debug-controller.ts.md](qr-debug-controller.ts.md), [qr-depth-resolver.ts.md](qr-depth-resolver.ts.md).
- `gps-plus-slam-app-framework/ar/qr-detection-controller` — the thin producer.
