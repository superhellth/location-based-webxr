/**
 * Property-Based Tests for TrackingStateManager
 *
 * These tests verify invariants that must hold regardless of input values,
 * using randomized testing to explore edge cases that example-based tests
 * might miss.
 *
 * Why these tests matter:
 * 1. State machine invariants must always hold
 * 2. lostFrameCount must never be negative
 * 3. Sensor orientation raw Euler angles are preserved in restart payload
 * 4. State transitions must follow the defined state machine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  TrackingStateManager,
  TrackingState,
  type TrackingStateCallbacks,
  type DeviceOrientation,
} from './tracking-state';
import type { ARPose } from './webxr-session';

/**
 * Arbitrary for generating valid AR poses
 */
const arbARPose = fc.record({
  position: fc.record({
    x: fc.double({ min: -1000, max: 1000, noNaN: true }),
    y: fc.double({ min: -1000, max: 1000, noNaN: true }),
    z: fc.double({ min: -1000, max: 1000, noNaN: true }),
  }),
  orientation: fc.record({
    x: fc.double({ min: -1, max: 1, noNaN: true }),
    y: fc.double({ min: -1, max: 1, noNaN: true }),
    z: fc.double({ min: -1, max: 1, noNaN: true }),
    w: fc.double({ min: -1, max: 1, noNaN: true }),
  }),
}) as fc.Arbitrary<ARPose>;

/**
 * Arbitrary for generating valid device orientations
 */
const arbDeviceOrientation = fc.record({
  alpha: fc.double({ min: 0, max: 360, noNaN: true }),
  beta: fc.double({ min: -180, max: 180, noNaN: true }),
  gamma: fc.double({ min: -90, max: 90, noNaN: true }),
}) as fc.Arbitrary<DeviceOrientation>;

/**
 * Arbitrary for generating sequences of tracking events
 */
const arbTrackingEvent = fc.oneof(
  arbARPose.map((pose) => ({ type: 'pose' as const, pose })),
  fc.constant({ type: 'lost' as const })
);

describe('TrackingStateManager property-based tests', () => {
  let callbacks: TrackingStateCallbacks;
  let currentOrientation: DeviceOrientation;

  beforeEach(() => {
    currentOrientation = { alpha: 0, beta: 0, gamma: 0, absolute: false };
    callbacks = {
      onTrackingLost: vi.fn(),
      onTrackingRestarted: vi.fn(),
      getDeviceOrientation: () => currentOrientation,
    };
  });

  describe('state machine invariants', () => {
    /**
     * Why this test matters:
     * The state must always be one of the three valid enum values.
     * Invalid states would break the tracking logic.
     */
    it('state is always one of the valid TrackingState values', () => {
      fc.assert(
        fc.property(fc.array(arbTrackingEvent, { maxLength: 50 }), (events) => {
          const manager = new TrackingStateManager(callbacks);

          for (const event of events) {
            if (event.type === 'pose') {
              manager.onPoseReceived(event.pose);
            } else {
              manager.onPoseLost();
            }
          }

          const state = manager.getState();
          expect([
            TrackingState.INITIALIZING,
            TrackingState.TRACKING,
            TrackingState.LOST,
          ]).toContain(state);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Why this test matters:
     * After receiving a valid pose, the state must always be TRACKING.
     * This is a fundamental invariant of the state machine.
     */
    it('state is TRACKING after receiving a pose', () => {
      fc.assert(
        fc.property(
          fc.array(arbTrackingEvent, { maxLength: 20 }),
          arbARPose,
          (events, finalPose) => {
            const manager = new TrackingStateManager(callbacks);

            // Apply random events
            for (const event of events) {
              if (event.type === 'pose') {
                manager.onPoseReceived(event.pose);
              } else {
                manager.onPoseLost();
              }
            }

            // Apply final pose
            manager.onPoseReceived(finalPose);

            expect(manager.getState()).toBe(TrackingState.TRACKING);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Why this test matters:
     * After reset(), the manager must return to its initial state
     * regardless of what happened before.
     */
    it('reset always returns to INITIALIZING state', () => {
      fc.assert(
        fc.property(fc.array(arbTrackingEvent, { maxLength: 30 }), (events) => {
          const manager = new TrackingStateManager(callbacks);

          for (const event of events) {
            if (event.type === 'pose') {
              manager.onPoseReceived(event.pose);
            } else {
              manager.onPoseLost();
            }
          }

          manager.reset();

          expect(manager.getState()).toBe(TrackingState.INITIALIZING);
          expect(manager.getLastValidPose()).toBeNull();
          expect(manager.getLostFrameCount()).toBe(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('lostFrameCount invariants', () => {
    /**
     * Why this test matters:
     * lostFrameCount must never be negative - it represents a count
     * of consecutive lost frames which cannot be negative.
     */
    it('lostFrameCount is always non-negative', () => {
      fc.assert(
        fc.property(fc.array(arbTrackingEvent, { maxLength: 50 }), (events) => {
          const manager = new TrackingStateManager(callbacks);

          for (const event of events) {
            if (event.type === 'pose') {
              manager.onPoseReceived(event.pose);
            } else {
              manager.onPoseLost();
            }

            expect(manager.getLostFrameCount()).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Why this test matters:
     * Each onPoseLost() call should increment the counter exactly once.
     * This verifies the counting logic is correct.
     */
    it('lostFrameCount equals number of consecutive onPoseLost calls', () => {
      fc.assert(
        fc.property(
          arbARPose,
          fc.integer({ min: 1, max: 100 }),
          (pose, lostCount) => {
            const manager = new TrackingStateManager(callbacks);

            // Start tracking
            manager.onPoseReceived(pose);
            expect(manager.getLostFrameCount()).toBe(0);

            // Lose tracking multiple times
            for (let i = 1; i <= lostCount; i++) {
              manager.onPoseLost();
              expect(manager.getLostFrameCount()).toBe(i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('pose storage invariants', () => {
    /**
     * Why this test matters:
     * The last valid pose must be preserved during tracking loss
     * so it can be used for alignment correction on restart.
     */
    it('lastValidPose is preserved during tracking loss', () => {
      fc.assert(
        fc.property(
          arbARPose,
          fc.integer({ min: 1, max: 20 }),
          (pose, lostFrames) => {
            const manager = new TrackingStateManager(callbacks);

            manager.onPoseReceived(pose);
            const storedPose = manager.getLastValidPose();

            for (let i = 0; i < lostFrames; i++) {
              manager.onPoseLost();
              expect(manager.getLastValidPose()).toEqual(storedPose);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('callback invariants', () => {
    /**
     * Why this test matters:
     * onTrackingLost should only be called once per loss event,
     * not on every frame where pose is null.
     */
    it('onTrackingLost is called exactly once per tracking loss', () => {
      fc.assert(
        fc.property(
          fc.array(arbARPose, { minLength: 1, maxLength: 10 }),
          fc.array(fc.integer({ min: 1, max: 10 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (poses, lostCounts) => {
            const onTrackingLost = vi.fn();
            const manager = new TrackingStateManager({
              ...callbacks,
              onTrackingLost,
            });

            let expectedLostCalls = 0;

            for (let cycle = 0; cycle < lostCounts.length; cycle++) {
              // Track with a pose
              const pose = poses[cycle % poses.length];
              manager.onPoseReceived(pose);

              // Lose tracking multiple times
              const lostCount = lostCounts[cycle];
              for (let i = 0; i < lostCount; i++) {
                manager.onPoseLost();
              }
              expectedLostCalls++; // Only one call per cycle
            }

            expect(onTrackingLost).toHaveBeenCalledTimes(expectedLostCalls);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('sensor rotation quaternion invariants', () => {
    /**
     * Why this test matters:
     * Any device orientation should produce a valid unit quaternion
     * in the restart payload. Non-unit quaternions would cause
     * The raw-storage pattern means raw Euler angles are preserved in the
     * payload and the reducer derives quaternions. This test verifies the
     * raw angles survive the round-trip for any orientation.
     */
    it('restart payload preserves raw Euler angles for any orientation', () => {
      fc.assert(
        fc.property(
          arbARPose,
          arbARPose,
          arbDeviceOrientation,
          arbDeviceOrientation,
          (pose1, pose2, orientation1, orientation2) => {
            let callCount = 0;
            const onTrackingRestarted = vi.fn();

            const manager = new TrackingStateManager({
              onTrackingLost: vi.fn(),
              onTrackingRestarted,
              getDeviceOrientation: () => {
                callCount++;
                return callCount <= 1 ? orientation1 : orientation2;
              },
            });

            manager.onPoseReceived(pose1);
            manager.onPoseLost();
            manager.markOriginReset();
            manager.onPoseReceived(pose2);

            expect(onTrackingRestarted).toHaveBeenCalled();
            const payload = onTrackingRestarted.mock.calls[0][0] as {
              lastSensorOrientation: {
                alpha: number;
                beta: number;
                gamma: number;
                absolute: boolean;
              };
              newSensorOrientation: {
                alpha: number;
                beta: number;
                gamma: number;
                absolute: boolean;
              };
            };

            // Raw Euler angles preserved in payload
            expect(payload.lastSensorOrientation.alpha).toBe(
              orientation1.alpha
            );
            expect(payload.lastSensorOrientation.beta).toBe(orientation1.beta);
            expect(payload.lastSensorOrientation.gamma).toBe(
              orientation1.gamma
            );

            expect(payload.newSensorOrientation.alpha).toBe(orientation2.alpha);
            expect(payload.newSensorOrientation.beta).toBe(orientation2.beta);
            expect(payload.newSensorOrientation.gamma).toBe(orientation2.gamma);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
