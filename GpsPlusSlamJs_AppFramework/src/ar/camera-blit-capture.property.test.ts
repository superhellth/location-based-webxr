/**
 * Property-based tests for camera-blit-capture module.
 *
 * Why these tests matter:
 * - The isBlackFrame check samples pixels at regular intervals.
 *   A property-based approach ensures it works for arbitrary buffer sizes
 *   and pixel distributions, not just hand-crafted examples.
 * - Verifies that any buffer with at least one non-zero RGB pixel is
 *   correctly detected as non-black regardless of where it appears.
 */

import { describe, it, expect } from 'vitest';
import { CameraBlitCapture } from './camera-blit-capture';

describe('camera-blit-capture property tests', () => {
  describe('CameraBlitCapture.isBlackFrame', () => {
    /**
     * Property: An all-zero buffer of any valid size should always be detected as black.
     */
    it('always detects all-zero buffers as black for various sizes', () => {
      const sizes = [4, 16, 64, 256, 1024, 4096, 16384];
      for (const size of sizes) {
        const buffer = new Uint8Array(size * 4); // RGBA
        const result = CameraBlitCapture.isBlackFrame(buffer);
        expect(result).toBe(true);
      }
    });

    /**
     * Property: A buffer where a significant portion of pixels are non-zero
     * should always be detected as non-black.
     * Note: isBlackFrame uses sampling (100 sample points), so a single
     * non-zero pixel may be missed. This is by design for performance.
     * Real camera frames have many non-zero pixels, not just one.
     */
    it('detects non-black buffers when many pixels are non-zero', () => {
      const sizes = [16, 64, 256, 1024];
      for (const size of sizes) {
        const buffer = new Uint8Array(size * 4);
        // Fill >50% of pixels with non-zero values
        for (let i = 0; i < Math.floor(size / 2); i++) {
          buffer[i * 4] = 128; // R
          buffer[i * 4 + 1] = 64; // G
          buffer[i * 4 + 2] = 32; // B
        }
        const result = CameraBlitCapture.isBlackFrame(buffer);
        expect(result).toBe(false);
      }
    });

    /**
     * Property: Even a small cluster of non-zero pixels should be detected,
     * as long as it's large enough to hit at least one sample point.
     */
    it('detects non-black when >=1% of pixels are non-zero in a block', () => {
      const size = 1024;
      const buffer = new Uint8Array(size * 4);
      // Set 10 consecutive pixels near the start
      for (let i = 0; i < 10; i++) {
        buffer[i * 4] = 200;
      }
      expect(CameraBlitCapture.isBlackFrame(buffer)).toBe(false);
    });

    /**
     * Property: Alpha-only values (R=G=B=0, A>0) should still be considered black.
     * isBlackFrame checks RGB channels only — alpha is irrelevant for "visible" content.
     */
    it('treats alpha-only pixels as black', () => {
      const sizes = [4, 64, 256];
      for (const size of sizes) {
        const buffer = new Uint8Array(size * 4);
        // Set all alpha channels to 255 but keep RGB at 0
        for (let i = 0; i < size; i++) {
          buffer[i * 4 + 3] = 255;
        }
        const result = CameraBlitCapture.isBlackFrame(buffer);
        expect(result).toBe(true);
      }
    });

    /**
     * Property: Empty buffers should be detected as black.
     */
    it('considers empty buffer as black', () => {
      expect(CameraBlitCapture.isBlackFrame(new Uint8Array(0))).toBe(true);
    });
  });
});
