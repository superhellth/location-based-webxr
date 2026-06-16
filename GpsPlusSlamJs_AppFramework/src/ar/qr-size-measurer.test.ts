/**
 * Tests for createQrSizeMeasurer — the shared depth→size piece.
 *
 * Why these tests matter:
 * - This is the extraction the Recorder reuses; its contract (sample → estimate,
 *   per-marker accumulation, null when un-sampleable) must be pinned so the
 *   refactor of the demo controller didn't change behaviour.
 * - A fake unprojector that maps a normalized corner to a planar square lets us
 *   assert the full pipeline (sample → estimateQrSizeFromDepth → accumulator)
 *   without a device.
 */

import { describe, it, expect } from 'vitest';
import {
  createQrSizeMeasurer,
  type QrSizeDepthContext,
} from './qr-size-measurer';
import type { Point2 } from './qr-pose';
import type { Vector3 } from 'gps-plus-slam-js';
import type { DepthPoint } from '../types/ar-types';

const IMAGE = { width: 100, height: 100 };

// A 0.2 m planar square: corners at screen 0.4/0.6, depth 1.
const SQUARE_CORNERS: Point2[] = [
  { x: 40, y: 40 }, // TL → screen (0.4, 0.4)
  { x: 60, y: 40 }, // TR
  { x: 60, y: 60 }, // BR
  { x: 40, y: 60 }, // BL
];

/**
 * Fake depth context that maps each normalized screen point onto a planar
 * square at z=1 (perfect quality): unproject([sx, sy, d]) = [sx, sy, d]. So the
 * 0.4↔0.6 corners give a 0.2 m square, planar, interior centroid on the plane.
 */
function planarSquareCtx(): QrSizeDepthContext {
  return {
    depthAt: () => 1,
    unprojector: {
      unproject: (p: DepthPoint): Vector3 | null => [
        p.screenX,
        p.screenY,
        p.depthM,
      ],
    },
  };
}

describe('createQrSizeMeasurer', () => {
  it('returns null when a corner has no depth', () => {
    const measurer = createQrSizeMeasurer();
    const ctx: QrSizeDepthContext = {
      ...planarSquareCtx(),
      depthAt: () => null, // no depth anywhere
    };
    expect(measurer.measure('q', SQUARE_CORNERS, IMAGE, ctx)).toBeNull();
  });

  it('returns null when there are not exactly 4 corners', () => {
    const measurer = createQrSizeMeasurer();
    const three = SQUARE_CORNERS.slice(0, 3);
    expect(measurer.measure('q', three, IMAGE, planarSquareCtx())).toBeNull();
  });

  it('measures a planar square and converges to "estimated"', () => {
    // Low minSamples so the lifecycle gate is reachable in a focused test.
    const measurer = createQrSizeMeasurer({ minSamples: 2, maxSpreadM: 0.01 });

    const first = measurer.measure(
      'q',
      SQUARE_CORNERS,
      IMAGE,
      planarSquareCtx()
    );
    expect(first).not.toBeNull();
    expect(first!.cornerSamples).toHaveLength(4);
    expect(first!.interiorSamples).toHaveLength(1); // centroid sampled
    expect(first!.estimate.status).toBe('measuring'); // 1 < minSamples
    expect(first!.estimate.estimateM).toBeCloseTo(0.2, 6);

    const second = measurer.measure(
      'q',
      SQUARE_CORNERS,
      IMAGE,
      planarSquareCtx()
    );
    expect(second!.estimate.status).toBe('estimated'); // ≥ minSamples, spread 0
    expect(second!.estimate.estimateM).toBeCloseTo(0.2, 6);
    expect(second!.estimate.sampleCount).toBe(2);
  });

  it('accumulates per marker text (independent estimates)', () => {
    const measurer = createQrSizeMeasurer({ minSamples: 1 });
    measurer.measure('a', SQUARE_CORNERS, IMAGE, planarSquareCtx());
    // 'b' has never been measured.
    expect(measurer.current('a').sampleCount).toBe(1);
    expect(measurer.current('b').status).toBe('unknown');
    expect(measurer.current('b').sampleCount).toBe(0);
  });

  it('reset(text) clears one marker; reset() clears all', () => {
    const measurer = createQrSizeMeasurer({ minSamples: 1 });
    measurer.measure('a', SQUARE_CORNERS, IMAGE, planarSquareCtx());
    measurer.measure('b', SQUARE_CORNERS, IMAGE, planarSquareCtx());

    measurer.reset('a');
    expect(measurer.current('a').sampleCount).toBe(0);
    expect(measurer.current('b').sampleCount).toBe(1);

    measurer.reset();
    expect(measurer.current('b').sampleCount).toBe(0);
  });

  it('current(text) is "unknown" before any measurement', () => {
    const measurer = createQrSizeMeasurer();
    const e = measurer.current('never-seen');
    expect(e.status).toBe('unknown');
    expect(e.estimateM).toBeNull();
  });
});

describe('createQrSizeMeasurer — depth-at-corners robustness (C1/C2)', () => {
  // A ctx whose depth grid has HOLES: depthAt returns null inside small windows
  // around chosen screen points (simulating the high-contrast corner boundary
  // where the coarse WebXR depth map has no near reading), depth 1 elsewhere.
  function holeyCtx(
    holes: Array<{ x: number; y: number; r: number }>
  ): QrSizeDepthContext {
    return {
      depthAt: (sx, sy) => {
        for (const h of holes) {
          if (Math.hypot(sx - h.x, sy - h.y) <= h.r) return null;
        }
        return 1;
      },
      unprojector: {
        unproject: (p: DepthPoint): Vector3 | null => [
          p.screenX,
          p.screenY,
          p.depthM,
        ],
      },
    };
  }

  it('C1: a corner with no exact depth still measures via inset fallback', () => {
    // Tiny hole exactly on the TL corner (screen 0.4,0.4); inset toward the
    // centroid (0.5,0.5) escapes it. Size must stay the true 0.2 m (the inset
    // only borrows depth — the corner position is preserved).
    const ctx = holeyCtx([{ x: 0.4, y: 0.4, r: 0.01 }]);
    const measurer = createQrSizeMeasurer({ minSamples: 1 });
    const m = measurer.measure('q', SQUARE_CORNERS, IMAGE, ctx);
    expect(m).not.toBeNull();
    expect(m!.estimate.estimateM).toBeCloseTo(0.2, 6);
    // Reported corner position is the TRUE corner, not the inset point.
    expect(m!.cornerSamples[0].screenX).toBeCloseTo(0.4, 6);
    expect(m!.cornerSamples[0].screenY).toBeCloseTo(0.4, 6);
  });

  it('C1: inset fallback can be disabled', () => {
    const ctx = holeyCtx([{ x: 0.4, y: 0.4, r: 0.01 }]);
    const measurer = createQrSizeMeasurer({
      cornerInsetFractions: [],
      maxReconstructedCorners: 0,
    });
    expect(measurer.measure('q', SQUARE_CORNERS, IMAGE, ctx)).toBeNull();
  });

  it('C1: one fully-missing corner is reconstructed from the other three', () => {
    // A hole covering the whole TL region (corner + its inset path toward the
    // centroid) → TL cannot be sampled at all; the planar fit through TR/BR/BL
    // fills its depth. r=0.05 covers TL+insets but not the other corners.
    const ctx = holeyCtx([{ x: 0.4, y: 0.4, r: 0.05 }]);
    const measurer = createQrSizeMeasurer({ minSamples: 1 });
    const m = measurer.measure('q', SQUARE_CORNERS, IMAGE, ctx);
    expect(m).not.toBeNull();
    // Planar surface at depth 1 → reconstructed TL depth is 1, size still 0.2 m.
    expect(m!.cornerSamples[0].depthM).toBeCloseTo(1, 6);
    expect(m!.estimate.estimateM).toBeCloseTo(0.2, 6);
  });

  it('C1: two missing corners exceed the reconstruction budget → null', () => {
    const ctx = holeyCtx([
      { x: 0.4, y: 0.4, r: 0.05 }, // TL + insets
      { x: 0.6, y: 0.4, r: 0.05 }, // TR + insets
    ]);
    const measurer = createQrSizeMeasurer();
    expect(measurer.measure('q', SQUARE_CORNERS, IMAGE, ctx)).toBeNull();
  });

  it('C2: the quality threshold is configurable (a strict gate rejects a noisy read)', () => {
    // A non-planar (noisy) read: push one corner off the z=1 plane so quality
    // drops below the default 0.8 but above a relaxed 0.3.
    const noisyCtx: QrSizeDepthContext = {
      depthAt: () => 1,
      unprojector: {
        unproject: (p: DepthPoint): Vector3 | null => {
          // TL (screen 0.4,0.4) is lifted out of plane; others stay planar.
          const z =
            p.screenX < 0.45 && p.screenY < 0.45 ? p.depthM + 0.05 : p.depthM;
          return [p.screenX, p.screenY, z];
        },
      },
    };
    const strict = createQrSizeMeasurer({
      minSamples: 1,
      qualityThreshold: 0.8,
    });
    const relaxed = createQrSizeMeasurer({
      minSamples: 1,
      qualityThreshold: 0.3,
    });
    // The frame is sampled either way (returns a measurement object)…
    const s = strict.measure('q', SQUARE_CORNERS, IMAGE, noisyCtx);
    const r = relaxed.measure('q', SQUARE_CORNERS, IMAGE, noisyCtx);
    expect(s).not.toBeNull();
    expect(r).not.toBeNull();
    // …but only the relaxed gate ACCEPTS the noisy observation into the estimate.
    expect(s!.estimate.sampleCount).toBe(0); // rejected by strict 0.8 gate
    expect(r!.estimate.sampleCount).toBe(1); // accepted by relaxed 0.3 gate
  });
});
