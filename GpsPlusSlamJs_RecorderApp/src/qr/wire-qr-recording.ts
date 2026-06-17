/**
 * Wire live QR RAW recording + the WS-5 debug viz into a running AR session.
 *
 * Composes the two halves of the recorder live-QR feature, gated by the operator
 * (`recordingOptions.qr.enabled`):
 *  - **Producer (WS-2):** the framework's thin `createQrDetectionController` fed by
 *    the camera-frame source. On each accepted decode it dispatches a RAW
 *    `recordQrDetection` (corners + camera pose + projection + frame size +
 *    timestamp) into the CURRENT store, so the persistence middleware records it.
 *  - **Consumer (WS-5):** a `createQrDebugController` subscribed to the store
 *    (re-attaching across `Start Recording` / replay store swaps) that renders the
 *    derived axis+cube under `arWorldGroup`.
 *
 * **Clock domain (load-bearing — plan open topic A):** the producer's `now` is
 * pinned to `performance.now()`, the SAME clock the recorded depth stream uses, so
 * the derive-on-read size as-of join pairs each detection with the right depth
 * sample. The producer defaults to `Date.now()`; passing `performance.now` here is
 * mandatory, not cosmetic.
 *
 * Camera-pose + projection for each observation come from the latest recorded
 * depth sample (mirrors the QR demo's verified post-detect read). NOTE the two
 * distinct projection matrices (open topic F): the QR observation carries the
 * depth sample's projection as the PnP-intrinsics source; the depth *unprojection*
 * uses that same sample's projection separately in the resolver. The producer's
 * `imageWidth/Height` come from the detector-frame buffer (the RGBA capture).
 *
 * The frame SOURCE is the single cadence owner (`startCameraFrameCapture({
 * intervalMs })`); the producer runs `minIntervalMs: 0` and detects every
 * delivered frame.
 *
 * @see qr-debug-controller.ts / qr-depth-resolver.ts — the consumer + as-of join.
 * @see gps-plus-slam-app-framework/ar/qr-detection-controller — the thin producer.
 */

import type { Object3D } from 'three';
// Deep subpaths (NOT the `…/ar` barrel): the barrel eagerly pulls heavy
// transitive deps (e.g. sensors/permission-checker), which breaks main.ts's
// wiring tests that mock those partially. Same rationale as the demo's
// qr-debug-view. We import only the few modules we actually use.
import {
  createQrDetectionController,
  type QrDetectionController,
} from 'gps-plus-slam-app-framework/ar/qr-detection-controller';
import {
  createBarcodeDetectorFrontEnd,
  type RgbaImage,
} from 'gps-plus-slam-app-framework/ar/qr-frontend';
import type { Pose } from 'gps-plus-slam-app-framework/ar/qr-pose';
import {
  startCameraFrameCapture,
  stopCameraFrameCapture,
} from 'gps-plus-slam-app-framework/ar/webxr-session';
import type { QrCaptureOptions } from 'gps-plus-slam-app-framework/state/recording-options';
import { recordQrDetection } from '../state/recorder-store';
import type { RecorderStore } from '../state/recorder-store';
import type { StoreRef } from '../state/store-ref';
import { createQrDebugController } from './qr-debug-controller';

export interface WireQrRecordingOptions {
  /** The active-store ref (producer + viz follow store swaps through it). */
  storeRef: StoreRef<RecorderStore>;
  /** The `arWorldGroup` the debug objects parent under (`null` until ready). */
  getArWorldGroup: () => Object3D | null;
  /** QR capture settings (`enabled` is assumed true by the caller's gate). */
  qr: QrCaptureOptions;
  /**
   * Receives the created producer so the pre-`initAR` camera-frame callback
   * (`setCameraFrameCallback`, which must be registered before the source is
   * built) can forward frames to it. Called with `null` on dispose.
   */
  setProducer: (producer: QrDetectionController | null) => void;
}

/**
 * Start QR recording + debug viz. Returns a dispose that stops capture, detaches
 * the producer, tears down the debug subscriber + views, and resets the resolver.
 */
export function wireQrRecording(options: WireQrRecordingOptions): () => void {
  const { storeRef, getArWorldGroup, qr, setProducer } = options;

  // --- Producer (WS-2) ------------------------------------------------------
  const frontEnd = createBarcodeDetectorFrontEnd();
  const detect = frontEnd
    ? (image: RgbaImage) => frontEnd.detect(image)
    : () => Promise.resolve(null);

  // Camera pose + projection for the observation: the latest recorded depth
  // sample, read on the CURRENT store at detection-resolve time.
  const getCameraPose = (): Pose | null => {
    const sample = storeRef.get().getState().recording.latestDepthSample;
    return sample
      ? { position: sample.cameraPos, rotation: sample.cameraRot }
      : null;
  };
  const getProjectionMatrix = () =>
    storeRef.get().getState().recording.latestDepthSample?.projectionMatrix ??
    null;

  const producer = createQrDetectionController({
    detect,
    getCameraPose,
    getProjectionMatrix,
    recordDetection: (observation) =>
      storeRef.get().dispatch(recordQrDetection(observation)),
    // MUST match the depth stream's clock (open topic A) — do not drop this.
    now: () => performance.now(),
    // The camera-frame source owns the cadence; detect every delivered frame.
    minIntervalMs: 0,
  });
  setProducer(producer);

  // Begin delivering frames at the configured cadence + capture resolution.
  startCameraFrameCapture({
    intervalMs: qr.intervalMs,
    captureSize: qr.captureSize,
  });

  // --- Consumer / debug viz (WS-5) -----------------------------------------
  const debug = createQrDebugController({
    getState: () => storeRef.get().getState(),
    getArWorldGroup,
  });

  const attach = (store: RecorderStore): (() => void) =>
    store.subscribe(() => debug.update());
  let detach = attach(storeRef.get());
  debug.update(); // reflect any pre-existing markers immediately
  const unsubscribeSwap = storeRef.subscribe((nextStore) => {
    detach();
    detach = attach(nextStore);
    debug.update();
  });

  return () => {
    stopCameraFrameCapture();
    producer.reset();
    setProducer(null);
    detach();
    unsubscribeSwap();
    debug.dispose();
  };
}
