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

const EPS = 1e-9;

/**
 * Robustness knobs for the depth-at-corners stage (on top of the accumulator
 * options). QR corners sit on a high-contrast print boundary where the coarse
 * WebXR depth grid often has no near reading; these let a measurement still
 * succeed instead of returning `null` every frame.
 */
export interface QrSizeMeasurerOptions extends QrSizeAccumulatorOptions {
  /**
   * When a corner pixel has no depth, retry at points inset toward the centroid
   * by these fractions (in order) and borrow the first valid depth — keeping the
   * TRUE corner screen position so the measured size is not shrunk. Default
   * `[0.12, 0.25]`. Set to `[]` to disable inset fallback.
   */
  cornerInsetFractions?: number[];
  /**
   * Max corners whose depth may be reconstructed by a planar fit through the
   * other three when still missing after the inset fallback. Default `1`
   * (tolerate one un-sampleable corner); `0` disables reconstruction.
   */
  maxReconstructedCorners?: number;
}

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
   * accumulator. Returns `null` when the corner depth cannot be sampled even
   * after the inset fallback and at-most-one planar reconstruction (i.e. ≥2
   * corners lack a depth read), or `corners.length !== 4` — the marker can't be
   * sized this frame. A degenerate quad does not fail here: the (null)
   * observation is simply not accumulated and the prior estimate stands.
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

/**
 * Depth at a corner with inset fallback: try the corner pixel first, then points
 * progressively inset toward the centroid. The returned {@link DepthPoint} always
 * carries the TRUE corner's screen position — only the depth VALUE may be borrowed
 * from an inset sample (valid because the marker face is locally planar over the
 * few-percent inset) — so the unprojected square keeps its real size. `null` when
 * no inset offers a depth read either.
 */
function sampleCornerDepth(
  corner: Point2,
  centroid: Point2,
  image: ImageSize,
  depthAt: QrSizeDepthContext['depthAt'],
  insetFractions: readonly number[]
): DepthPoint | null {
  const s = toScreen(corner, image);
  const exact = depthAt(s.x, s.y);
  if (exact !== null) return { screenX: s.x, screenY: s.y, depthM: exact };
  for (const f of insetFractions) {
    const inset = {
      x: corner.x + f * (centroid.x - corner.x),
      y: corner.y + f * (centroid.y - corner.y),
    };
    const si = toScreen(inset, image);
    const depthM = depthAt(si.x, si.y);
    // Report at the true corner position with the borrowed depth.
    if (depthM !== null) return { screenX: s.x, screenY: s.y, depthM };
  }
  return null;
}

/**
 * Estimate a missing corner's depth by fitting a plane `depth = f(screenX,
 * screenY)` through three known corner samples and evaluating it at the missing
 * corner's screen position. `null` when the three are collinear in screen space
 * (degenerate plane).
 */
function reconstructDepth(
  known: readonly DepthPoint[],
  at: { x: number; y: number }
): number | null {
  if (known.length < 3) return null;
  const [a, b, c] = known as [DepthPoint, DepthPoint, DepthPoint];
  const abx = b.screenX - a.screenX;
  const aby = b.screenY - a.screenY;
  const abz = b.depthM - a.depthM;
  const acx = c.screenX - a.screenX;
  const acy = c.screenY - a.screenY;
  const acz = c.depthM - a.depthM;
  // Plane normal = AB × AC; nz is the screen-space Jacobian determinant.
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  if (Math.abs(nz) < EPS) return null;
  const depthM =
    a.depthM - (nx * (at.x - a.screenX) + ny * (at.y - a.screenY)) / nz;
  return Number.isFinite(depthM) ? depthM : null;
}

/**
 * Build the 4 corner depth samples with inset fallback and at-most-`maxRecon`
 * planar reconstruction. `null` when more corners than allowed lack a depth read.
 */
function cornerDepthPoints(
  corners: readonly Point2[],
  image: ImageSize,
  depthAt: QrSizeDepthContext['depthAt'],
  insetFractions: readonly number[],
  maxRecon: number
): [DepthPoint, DepthPoint, DepthPoint, DepthPoint] | null {
  if (corners.length !== 4) return null;
  const centroid = {
    x: corners.reduce((s, c) => s + c.x, 0) / corners.length,
    y: corners.reduce((s, c) => s + c.y, 0) / corners.length,
  };
  const sampled = corners.map((corner) =>
    sampleCornerDepth(corner, centroid, image, depthAt, insetFractions)
  );
  const missing = sampled.filter((p) => p === null).length;
  if (missing === 0) {
    return sampled as [DepthPoint, DepthPoint, DepthPoint, DepthPoint];
  }
  if (missing > maxRecon) return null;

  // Reconstruct each missing corner's depth from the planar fit of the known
  // ones, at the true corner screen position.
  const known = sampled.filter((p): p is DepthPoint => p !== null);
  const out: DepthPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const s = sampled[i];
    if (s) {
      out.push(s);
      continue;
    }
    const at = toScreen(corners[i] as Point2, image);
    const depthM = reconstructDepth(known, at);
    if (depthM === null) return null;
    out.push({ screenX: at.x, screenY: at.y, depthM });
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
 * Create a size measurer. Accumulator `options` (quality threshold, min samples,
 * spread, cap) are forwarded to every per-marker {@link createQrSizeAccumulator};
 * the depth-at-corners knobs ({@link QrSizeMeasurerOptions.cornerInsetFractions},
 * {@link QrSizeMeasurerOptions.maxReconstructedCorners}) tune corner sampling.
 */
export function createQrSizeMeasurer(
  options: QrSizeMeasurerOptions = {}
): QrSizeMeasurer {
  const insetFractions = options.cornerInsetFractions ?? [0.12, 0.25];
  const maxRecon = options.maxReconstructedCorners ?? 1;
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
      const cornerSamples = cornerDepthPoints(
        corners,
        image,
        ctx.depthAt,
        insetFractions,
        maxRecon
      );
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
