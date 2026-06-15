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
