/**
 * QR size measurer — the composable depth→size piece shared by the QR demo and
 * (next) the Recorder (framework-wiring-options Part B, Option 2).
 *
 * Bundles the per-detection depth sampling + the per-marker running-median
 * accumulator that previously lived inside the demo's controller, so BOTH apps
 * wire one measurer instead of re-implementing the loop:
 *
 *   detection corners (px) + frame size + a depth context
 *     → sample depth at the 4 corners + the centroid (interior)
 *     → {@link estimateQrSizeFromDepth} (one observation)
 *     → per-`text` {@link QrSizeAccumulator}.add → the size lifecycle estimate
 *
 * It is intentionally **pose-agnostic**: it returns the sampled corner depth
 * points so a consumer that also wants a depth-fit pose (the demo) can unproject
 * them without re-sampling, while a consumer that only needs the size (the
 * Recorder, which solves pose via PnP) ignores them. Promoting the rigid
 * depth-corner *pose* fit (`poseFromWorldCorners`) is the separate §3.3
 * follow-up.
 *
 * @see qr-size-from-depth.ts — the per-observation estimate + the accumulator.
 * @see depth-unprojection.ts — `DepthUnprojector`.
 */

import type { Point2 } from './qr-pose.js';
import type { DepthPoint } from '../types/ar-types.js';
import type { DepthUnprojector } from './depth-unprojection.js';
import {
  estimateQrSizeFromDepth,
  createQrSizeAccumulator,
  type QrSizeAccumulator,
  type QrSizeAccumulatorOptions,
  type QrSizeEstimate,
} from './qr-size-from-depth.js';

/** The per-frame depth access the measurer needs (a subset of the demo's `DepthContext`). */
export interface QrSizeDepthContext {
  /** Depth (m) at a normalized screen point, or `null` if unavailable there. */
  depthAt: (screenX: number, screenY: number) => number | null;
  /** Unprojector for the current depth sample (`createDepthUnprojector`). */
  unprojector: DepthUnprojector;
}

/** Minimal frame dimensions needed to normalize pixel corners to screen coords. */
export interface ImageSize {
  width: number;
  height: number;
}

/** One measurement: the accumulated estimate plus the raw depth samples used. */
export interface QrSizeMeasurement {
  /** The per-marker running estimate AFTER folding in this observation. */
  estimate: QrSizeEstimate;
  /** The 4 corner depth samples (detector order), normalized screen coords. */
  cornerSamples: [DepthPoint, DepthPoint, DepthPoint, DepthPoint];
  /** Interior (centroid) depth samples used for the planarity check (may be empty). */
  interiorSamples: DepthPoint[];
}

export interface QrSizeMeasurer {
  /**
   * Measure one detection's size from depth and fold it into the per-`text`
   * accumulator. Returns `null` only when the corner depth cannot be sampled
   * (any corner lacks a depth read, or `corners.length !== 4`) — i.e. the
   * marker can't be sized this frame. A degenerate quad does not fail here: the
   * (null) observation is simply not accumulated and the prior estimate stands.
   */
  measure(
    text: string,
    corners: readonly Point2[],
    image: ImageSize,
    ctx: QrSizeDepthContext
  ): QrSizeMeasurement | null;
  /** Current estimate for a marker without adding a sample. */
  current(text: string): QrSizeEstimate;
  /** Drop one marker's samples (`text` given) or all of them. */
  reset(text?: string): void;
}

/** Pixel corner → normalized screen point for the given frame. */
function toScreen(corner: Point2, image: ImageSize): { x: number; y: number } {
  return { x: corner.x / image.width, y: corner.y / image.height };
}

/** Build the 4 corner depth samples; `null` if any corner lacks a depth read. */
function cornerDepthPoints(
  corners: readonly Point2[],
  image: ImageSize,
  depthAt: QrSizeDepthContext['depthAt']
): [DepthPoint, DepthPoint, DepthPoint, DepthPoint] | null {
  if (corners.length !== 4) return null;
  const out: DepthPoint[] = [];
  for (const corner of corners) {
    const s = toScreen(corner, image);
    const depthM = depthAt(s.x, s.y);
    if (depthM === null) return null;
    out.push({ screenX: s.x, screenY: s.y, depthM });
  }
  return out as [DepthPoint, DepthPoint, DepthPoint, DepthPoint];
}

/** The QR centroid as a single interior depth sample (may be empty). */
function interiorDepthPoints(
  corners: readonly Point2[],
  image: ImageSize,
  depthAt: QrSizeDepthContext['depthAt']
): DepthPoint[] {
  const cx = corners.reduce((s, c) => s + c.x, 0) / corners.length;
  const cy = corners.reduce((s, c) => s + c.y, 0) / corners.length;
  const s = toScreen({ x: cx, y: cy }, image);
  const depthM = depthAt(s.x, s.y);
  return depthM === null ? [] : [{ screenX: s.x, screenY: s.y, depthM }];
}

/**
 * Create a size measurer. `options` are forwarded to every per-marker
 * {@link createQrSizeAccumulator} (quality threshold, min samples, spread, cap).
 */
export function createQrSizeMeasurer(
  options: QrSizeAccumulatorOptions = {}
): QrSizeMeasurer {
  const accumulators = new Map<string, QrSizeAccumulator>();

  function accumulatorFor(text: string): QrSizeAccumulator {
    let acc = accumulators.get(text);
    if (!acc) {
      acc = createQrSizeAccumulator(options);
      accumulators.set(text, acc);
    }
    return acc;
  }

  return {
    measure(text, corners, image, ctx): QrSizeMeasurement | null {
      const cornerSamples = cornerDepthPoints(corners, image, ctx.depthAt);
      if (!cornerSamples) return null;

      const interiorSamples = interiorDepthPoints(corners, image, ctx.depthAt);
      const observation = estimateQrSizeFromDepth(
        cornerSamples,
        interiorSamples,
        ctx.unprojector
      );
      const estimate = accumulatorFor(text).add(observation);
      return { estimate, cornerSamples, interiorSamples };
    },
    current(text): QrSizeEstimate {
      return accumulatorFor(text).current();
    },
    reset(text?: string): void {
      if (text === undefined) {
        accumulators.clear();
      } else {
        accumulators.delete(text);
      }
    },
  };
}
