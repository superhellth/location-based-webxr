/**
 * Lerp Utilities Tests
 *
 * Why this test matters: R3 — both alignment-lerper and camera-follower
 * duplicated DEFAULT_LERP_RATE and the clamped-alpha formula. These tests
 * ensure the extracted utility has the expected constants and behaviour.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_LERP_RATE, clampedAlpha } from './lerp-utils';

describe('lerp-utils', () => {
  describe('DEFAULT_LERP_RATE', () => {
    it('equals 8 (matching the previously duplicated value)', () => {
      expect(DEFAULT_LERP_RATE).toBe(8);
    });
  });

  describe('clampedAlpha', () => {
    it('returns lerpRate * dt for small dt', () => {
      // 8 * 0.016 = 0.128 (typical 60fps frame)
      expect(clampedAlpha(8, 0.016)).toBeCloseTo(0.128, 5);
    });

    it('clamps to 1.0 when lerpRate * dt exceeds 1', () => {
      // 8 * 0.5 = 4.0 → clamped to 1.0
      expect(clampedAlpha(8, 0.5)).toBe(1.0);
    });

    it('returns exactly 1.0 at the boundary', () => {
      // 8 * 0.125 = 1.0 → exactly 1.0
      expect(clampedAlpha(8, 0.125)).toBe(1.0);
    });

    it('returns 0 when dt is 0', () => {
      expect(clampedAlpha(8, 0)).toBe(0);
    });
  });
});
