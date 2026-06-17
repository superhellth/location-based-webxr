/**
 * Tests for the as-of depth resolver (WS-5).
 *
 * Why this matters: the derive-on-read size join pairs each QR detection with the
 * depth context active AT its timestamp. The store keeps only the latest depth
 * sample, so this resolver is what makes the join reproducible on replay. These
 * tests pin: (1) the as-of selection (latest sample ≤ the query timestamp),
 * (2) null before any sample / when no sample precedes the query, (3) a sample
 * with no projection yields no context (best-effort, no throw), (4) identity
 * de-dup + the bounded history cap.
 */

import { describe, it, expect } from 'vitest';
import type {
  Matrix4,
  Quaternion,
  Vector3,
} from 'gps-plus-slam-app-framework/core';
import type {
  DepthPoint,
  DepthSample,
} from 'gps-plus-slam-app-framework/types/ar-types';
import { createQrDepthResolver } from './qr-depth-resolver';

/** An invertible projection so `createDepthUnprojector` yields a real unprojector. */
const IDENTITY_PROJ = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
] as unknown as Matrix4;

const camPos = [0, 0, 0] as Vector3;
const camRot = [0, 0, 0, 1] as Quaternion;

/** A 2×2 grid of constant depth `depthM` (so `depthAt` returns it everywhere). */
function constantGrid(depthM: number): DepthPoint[] {
  const positions = [
    [1 / 3, 1 / 3],
    [2 / 3, 1 / 3],
    [1 / 3, 2 / 3],
    [2 / 3, 2 / 3],
  ];
  return positions.map(([screenX, screenY]) => ({
    screenX: screenX!,
    screenY: screenY!,
    depthM,
  }));
}

function sample(
  timestamp: number,
  depthM: number,
  withProjection = true
): DepthSample {
  return {
    timestamp,
    cameraPos: camPos,
    cameraRot: camRot,
    points: constantGrid(depthM),
    ...(withProjection ? { projectionMatrix: IDENTITY_PROJ } : {}),
  };
}

describe('createQrDepthResolver', () => {
  it('returns null before any sample is appended', () => {
    const resolver = createQrDepthResolver();
    expect(resolver.resolveDepthAt(100)).toBeNull();
  });

  it('returns null when no sample precedes the query timestamp', () => {
    const resolver = createQrDepthResolver();
    resolver.append(sample(200, 1));
    // Query is BEFORE the only sample → no as-of match.
    expect(resolver.resolveDepthAt(100)).toBeNull();
  });

  it('selects the latest sample at or before the query timestamp (as-of join)', () => {
    const resolver = createQrDepthResolver();
    resolver.append(sample(100, 1.0));
    resolver.append(sample(200, 2.0));
    resolver.append(sample(300, 3.0));

    // At t=250 the active sample is the one stamped 200 (depth 2.0), NOT 300.
    const ctx = resolver.resolveDepthAt(250);
    expect(ctx).not.toBeNull();
    expect(ctx!.depthAt(0.5, 0.5)).toBeCloseTo(2.0, 6);

    // Exactly on a sample timestamp resolves to that sample.
    expect(resolver.resolveDepthAt(300)!.depthAt(0.5, 0.5)).toBeCloseTo(3.0, 6);

    // After the last sample, the last one stays active.
    expect(resolver.resolveDepthAt(9999)!.depthAt(0.5, 0.5)).toBeCloseTo(
      3.0,
      6
    );
  });

  it('yields no context for a matching sample that lacks a projection matrix', () => {
    const resolver = createQrDepthResolver();
    resolver.append(sample(100, 1.0, /* withProjection */ false));
    // The sample matches the as-of query, but no projection → no unprojector.
    expect(resolver.resolveDepthAt(150)).toBeNull();
  });

  it('is idempotent on identity (same object appended twice is one entry)', () => {
    const resolver = createQrDepthResolver({ maxSamples: 2 });
    const s = sample(100, 1.0);
    resolver.append(s);
    resolver.append(s); // same object → no-op
    resolver.append(sample(200, 2.0));
    // Both distinct samples are still present (the dup did not evict 100).
    expect(resolver.resolveDepthAt(100)!.depthAt(0.5, 0.5)).toBeCloseTo(1.0, 6);
    expect(resolver.resolveDepthAt(200)!.depthAt(0.5, 0.5)).toBeCloseTo(2.0, 6);
  });

  it('bounds the history to maxSamples (oldest dropped)', () => {
    const resolver = createQrDepthResolver({ maxSamples: 2 });
    resolver.append(sample(100, 1.0));
    resolver.append(sample(200, 2.0));
    resolver.append(sample(300, 3.0)); // evicts the 100 sample
    expect(resolver.resolveDepthAt(150)).toBeNull(); // 100 is gone
    expect(resolver.resolveDepthAt(250)!.depthAt(0.5, 0.5)).toBeCloseTo(2.0, 6);
  });

  it('reset() clears the history', () => {
    const resolver = createQrDepthResolver();
    resolver.append(sample(100, 1.0));
    resolver.reset();
    expect(resolver.resolveDepthAt(100)).toBeNull();
  });
});
