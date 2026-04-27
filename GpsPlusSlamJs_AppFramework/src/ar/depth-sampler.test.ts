/**
 * Depth Sampler Tests
 *
 * Tests for sampling depth points from WebXR depth sensing API.
 *
 * Why this test matters:
 * Depth data provides 3D point samples that can be used for
 * 3D reconstruction and validating AR tracking accuracy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  DepthSampler,
  type DepthSamplerConfig,
  type DepthSamplerCallbacks,
} from './depth-sampler';

describe('DepthSampler', () => {
  let callbacks: DepthSamplerCallbacks;
  let sampler: DepthSampler;

  beforeEach(() => {
    callbacks = {
      onSampleCaptured: vi.fn(),
      getCurrentPose: vi.fn(() => ({
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      })),
    };
    sampler = new DepthSampler(callbacks);
  });

  afterEach(() => {
    sampler.stop();
  });

  describe('constructor', () => {
    it('creates with default config', () => {
      expect(sampler.getSampleCount()).toBe(0);
      expect(sampler.isRunning()).toBe(false);
    });

    it('accepts custom config', () => {
      const config: Partial<DepthSamplerConfig> = {
        intervalMs: 500,
        gridSize: 5,
      };
      const customSampler = new DepthSampler(callbacks, config);
      expect(customSampler.getConfig().intervalMs).toBe(500);
      expect(customSampler.getConfig().gridSize).toBe(5);
      customSampler.stop();
    });

    it('uses default interval of 1000ms', () => {
      expect(sampler.getConfig().intervalMs).toBe(1000);
    });

    it('uses default grid size of 3', () => {
      expect(sampler.getConfig().gridSize).toBe(3);
    });
  });

  describe('start/stop', () => {
    it('starts sampling when start() is called', () => {
      sampler.start();
      expect(sampler.isRunning()).toBe(true);
    });

    it('stops sampling when stop() is called', () => {
      sampler.start();
      sampler.stop();
      expect(sampler.isRunning()).toBe(false);
    });

    it('can be started and stopped multiple times', () => {
      sampler.start();
      sampler.stop();
      sampler.start();
      expect(sampler.isRunning()).toBe(true);
    });

    it('resets sample count on start', () => {
      sampler.start();
      // Simulate a sample via onFrame
      sampler.onFrame(1000, createMockDepthInfo(3));
      expect(sampler.getSampleCount()).toBe(1);

      sampler.stop();
      sampler.start();
      expect(sampler.getSampleCount()).toBe(0);
    });
  });

  describe('onFrame', () => {
    it('does not sample when not running', () => {
      sampler.onFrame(1000, createMockDepthInfo(3));
      expect(callbacks.onSampleCaptured).not.toHaveBeenCalled();
    });

    it('samples immediately on first frame after start', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));
      expect(callbacks.onSampleCaptured).toHaveBeenCalledOnce();
    });

    it('respects sampling interval', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));
      sampler.onFrame(500, createMockDepthInfo(3)); // Too soon
      sampler.onFrame(1000, createMockDepthInfo(3)); // Should sample

      expect(callbacks.onSampleCaptured).toHaveBeenCalledTimes(2);
    });

    it('does not sample if depth info is null', () => {
      sampler.start();
      sampler.onFrame(0, null);
      expect(callbacks.onSampleCaptured).not.toHaveBeenCalled();
    });

    it('does not sample if pose is null', () => {
      vi.mocked(callbacks.getCurrentPose).mockReturnValue(null);
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));
      expect(callbacks.onSampleCaptured).not.toHaveBeenCalled();
    });

    it('increments sample count on successful sample', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));
      sampler.onFrame(1000, createMockDepthInfo(3));

      expect(sampler.getSampleCount()).toBe(2);
    });
  });

  describe('depth sampling', () => {
    /**
     * Why this test matters:
     * cameraPos must be in raw WebXR convention (the reducer applies
     * webxrToNUE). WebXR {x:1, y:2, z:3} → [1, 2, 3]
     * Timestamp must be epoch ms (not DOMHighResTimeStamp) for consistency
     * with all other action timestamps.
     */
    it('provides cameraPos in raw WebXR convention and timestamp as epoch ms', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));

      const sample = vi.mocked(callbacks.onSampleCaptured).mock.calls[0][0];
      expect(sample.cameraPos).toEqual([1, 2, 3]);
      expect(sample.cameraRot).toEqual([0, 0, 0, 1]);
      // Timestamp should be performance.timeOrigin + frame time (0)
      expect(sample.timestamp).toBe(performance.timeOrigin);
    });

    it('samples grid of points from depth buffer', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));

      const sample = vi.mocked(callbacks.onSampleCaptured).mock.calls[0][0];
      // 3x3 grid = 9 points
      expect(sample.points).toHaveLength(9);
    });

    it('uses correct grid coordinates', () => {
      const config: Partial<DepthSamplerConfig> = {
        intervalMs: 1000,
        gridSize: 3,
      };
      const gridSampler = new DepthSampler(callbacks, config);
      gridSampler.start();
      gridSampler.onFrame(0, createMockDepthInfo(3));

      const sample = vi.mocked(callbacks.onSampleCaptured).mock.calls[0][0];
      // Should have points at normalized coords like (0.25, 0.25), (0.5, 0.5), (0.75, 0.75)
      expect(sample.points[0].screenX).toBeCloseTo(0.25, 2);
      expect(sample.points[0].screenY).toBeCloseTo(0.25, 2);

      gridSampler.stop();
    });

    it('includes depth values in meters', () => {
      sampler.start();
      sampler.onFrame(0, createMockDepthInfo(3));

      const sample = vi.mocked(callbacks.onSampleCaptured).mock.calls[0][0];
      for (const point of sample.points) {
        expect(typeof point.depthM).toBe('number');
        expect(point.depthM).toBeGreaterThan(0);
      }
    });

    it('handles varying grid sizes', () => {
      const config: Partial<DepthSamplerConfig> = {
        intervalMs: 1000,
        gridSize: 5,
      };
      const largeSampler = new DepthSampler(callbacks, config);
      largeSampler.start();
      largeSampler.onFrame(0, createMockDepthInfo(5));

      const sample = vi.mocked(callbacks.onSampleCaptured).mock.calls[0][0];
      // 5x5 grid = 25 points
      expect(sample.points).toHaveLength(25);

      largeSampler.stop();
    });
  });

  describe('property-based tests', () => {
    /**
     * Why this test matters:
     * Grid size determines point count - must always be gridSize^2 points.
     */
    it('always produces gridSize^2 points for any valid grid size', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (gridSize) => {
          const config: Partial<DepthSamplerConfig> = {
            intervalMs: 1000,
            gridSize,
          };
          const propSampler = new DepthSampler(callbacks, config);
          propSampler.start();
          propSampler.onFrame(0, createMockDepthInfo(gridSize));

          const sample = vi
            .mocked(callbacks.onSampleCaptured)
            .mock.calls.pop()![0];
          expect(sample.points).toHaveLength(gridSize * gridSize);

          propSampler.stop();
        })
      );
    });

    /**
     * Why this test matters:
     * All grid coordinates must be within (0, 1) range and avoid edges.
     */
    it('all grid points are within (0, 1) bounds', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (gridSize) => {
          const config: Partial<DepthSamplerConfig> = {
            intervalMs: 1000,
            gridSize,
          };
          const propSampler = new DepthSampler(callbacks, config);
          propSampler.start();
          propSampler.onFrame(0, createMockDepthInfo(gridSize));

          const sample = vi
            .mocked(callbacks.onSampleCaptured)
            .mock.calls.pop()![0];
          for (const point of sample.points) {
            expect(point.screenX).toBeGreaterThan(0);
            expect(point.screenX).toBeLessThan(1);
            expect(point.screenY).toBeGreaterThan(0);
            expect(point.screenY).toBeLessThan(1);
          }

          propSampler.stop();
        })
      );
    });

    /**
     * Why this test matters:
     * Interval enforcement must work for any positive interval value.
     */
    it('respects any positive sampling interval', () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 5000 }), (intervalMs) => {
          const config: Partial<DepthSamplerConfig> = {
            intervalMs,
            gridSize: 2,
          };
          const intervalCallbacks: DepthSamplerCallbacks = {
            onSampleCaptured: vi.fn(),
            getCurrentPose: () => ({
              position: { x: 0, y: 0, z: 0 },
              orientation: { x: 0, y: 0, z: 0, w: 1 },
            }),
          };
          const propSampler = new DepthSampler(intervalCallbacks, config);
          propSampler.start();

          // First sample at t=0
          propSampler.onFrame(0, createMockDepthInfo(2));
          // Too early - should not sample
          propSampler.onFrame(intervalMs - 1, createMockDepthInfo(2));
          // Exactly on interval - should sample
          propSampler.onFrame(intervalMs, createMockDepthInfo(2));

          expect(intervalCallbacks.onSampleCaptured).toHaveBeenCalledTimes(2);

          propSampler.stop();
        })
      );
    });
  });

  describe('depth unavailability detection', () => {
    /**
     * These tests validate Field Test Readiness Issue #8:
     * Notify user when depth sensing is unavailable despite being requested.
     */

    it('does not fire unavailable callback before threshold', () => {
      const onDepthUnavailable = vi.fn();
      const testSampler = new DepthSampler(
        { ...callbacks, onDepthUnavailable },
        { unavailabilityThresholdMs: 5000 }
      );

      // Mock performance.now to return predictable values
      let mockTime = 0;
      const performanceSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => mockTime);

      testSampler.start();
      mockTime = 1000;
      testSampler.onFrame(1000, null); // No depth data

      expect(onDepthUnavailable).not.toHaveBeenCalled();

      testSampler.stop();
      performanceSpy.mockRestore();
    });

    it('fires unavailable callback after threshold with no depth data', () => {
      const onDepthUnavailable = vi.fn();
      const testSampler = new DepthSampler(
        { ...callbacks, onDepthUnavailable },
        { unavailabilityThresholdMs: 5000 }
      );

      let mockTime = 0;
      const performanceSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => mockTime);

      testSampler.start();
      mockTime = 5001; // Past threshold
      testSampler.onFrame(5001, null); // No depth data

      expect(onDepthUnavailable).toHaveBeenCalledTimes(1);

      testSampler.stop();
      performanceSpy.mockRestore();
    });

    it('does not fire unavailable callback if depth data is received', () => {
      const onDepthUnavailable = vi.fn();
      const testSampler = new DepthSampler(
        { ...callbacks, onDepthUnavailable },
        { unavailabilityThresholdMs: 5000 }
      );

      let mockTime = 0;
      const performanceSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => mockTime);

      testSampler.start();
      mockTime = 1000;
      // Receive valid depth data
      testSampler.onFrame(1000, createMockDepthInfo(3));
      mockTime = 6000;
      testSampler.onFrame(6000, null); // Depth later becomes unavailable

      expect(onDepthUnavailable).not.toHaveBeenCalled();

      testSampler.stop();
      performanceSpy.mockRestore();
    });

    it('fires unavailable callback only once', () => {
      const onDepthUnavailable = vi.fn();
      const testSampler = new DepthSampler(
        { ...callbacks, onDepthUnavailable },
        { unavailabilityThresholdMs: 5000 }
      );

      let mockTime = 0;
      const performanceSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => mockTime);

      testSampler.start();
      mockTime = 6000;
      testSampler.onFrame(6000, null);
      testSampler.onFrame(7000, null);
      testSampler.onFrame(8000, null);

      expect(onDepthUnavailable).toHaveBeenCalledTimes(1);

      testSampler.stop();
      performanceSpy.mockRestore();
    });

    it('does not throw if no unavailable callback is provided', () => {
      // Use default callbacks without onDepthUnavailable
      const testSampler = new DepthSampler(callbacks, {
        unavailabilityThresholdMs: 100,
      });

      const performanceSpy = vi
        .spyOn(performance, 'now')
        .mockImplementation(() => 1000);

      testSampler.start();

      expect(() => testSampler.onFrame(1000, null)).not.toThrow();

      testSampler.stop();
      performanceSpy.mockRestore();
    });

    it('hasReceivedDepth returns false initially', () => {
      expect(sampler.hasReceivedDepth()).toBe(false);
    });

    it('hasReceivedDepth returns true after receiving depth', () => {
      sampler.start();
      sampler.onFrame(1000, createMockDepthInfo(3));
      expect(sampler.hasReceivedDepth()).toBe(true);
    });

    it('hasReceivedDepth resets to false on start', () => {
      sampler.start();
      sampler.onFrame(1000, createMockDepthInfo(3));
      sampler.stop();
      sampler.start();
      expect(sampler.hasReceivedDepth()).toBe(false);
    });
  });
});

/**
 * Create a mock depth info object for testing.
 */
function createMockDepthInfo(_gridSize: number): {
  getDepthInMeters: (x: number, y: number) => number;
  width: number;
  height: number;
} {
  return {
    width: 256,
    height: 256,
    getDepthInMeters: (x: number, y: number) => {
      // Return a depth based on position (1-5 meters)
      return 1 + x * 2 + y * 2;
    },
  };
}
