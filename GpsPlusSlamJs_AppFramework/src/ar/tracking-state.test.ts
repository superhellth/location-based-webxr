/**
 * Tracking State Manager Tests
 *
 * Tests for detecting AR tracking loss and restart, and dispatching
 * the odometryTrackingRestarted action to maintain alignment.
 *
 * Why this test matters:
 * When AR tracking is lost and restarted, the odometry frame resets.
 * We need to dispatch the library's odometryTrackingRestarted action
 * to maintain alignment between GPS and AR coordinate frames.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TrackingStateManager,
  TrackingState,
  type TrackingStateCallbacks,
} from './tracking-state';
import type { ARPose } from './webxr-session';

describe('TrackingStateManager', () => {
  let callbacks: TrackingStateCallbacks;
  let manager: TrackingStateManager;

  beforeEach(() => {
    callbacks = {
      onTrackingLost: vi.fn(),
      onTrackingRestarted: vi.fn(),
      getDeviceOrientation: vi.fn(() => ({
        alpha: 0,
        beta: 0,
        gamma: 0,
        absolute: false,
      })),
    };
    manager = new TrackingStateManager(callbacks);
  });

  describe('constructor', () => {
    it('starts with INITIALIZING state', () => {
      expect(manager.getState()).toBe(TrackingState.INITIALIZING);
    });

    it('has no last valid pose initially', () => {
      expect(manager.getLastValidPose()).toBeNull();
    });
  });

  describe('onPoseReceived', () => {
    const validPose: ARPose = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    it('transitions from INITIALIZING to TRACKING on first pose', () => {
      manager.onPoseReceived(validPose);
      expect(manager.getState()).toBe(TrackingState.TRACKING);
    });

    it('stores the pose as last valid pose', () => {
      manager.onPoseReceived(validPose);
      expect(manager.getLastValidPose()).toEqual(validPose);
    });

    it('updates last valid pose on subsequent valid poses', () => {
      manager.onPoseReceived(validPose);

      const newPose: ARPose = {
        position: { x: 4, y: 5, z: 6 },
        orientation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
      };
      manager.onPoseReceived(newPose);

      expect(manager.getLastValidPose()).toEqual(newPose);
    });

    it('does not call onTrackingLost when receiving valid poses', () => {
      manager.onPoseReceived(validPose);
      manager.onPoseReceived(validPose);
      expect(callbacks.onTrackingLost).not.toHaveBeenCalled();
    });
  });

  describe('onPoseLost', () => {
    const validPose: ARPose = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    it('transitions from TRACKING to LOST', () => {
      manager.onPoseReceived(validPose);
      manager.onPoseLost();

      expect(manager.getState()).toBe(TrackingState.LOST);
    });

    it('calls onTrackingLost callback', () => {
      manager.onPoseReceived(validPose);
      manager.onPoseLost();

      expect(callbacks.onTrackingLost).toHaveBeenCalledOnce();
    });

    it('preserves last valid pose when tracking is lost', () => {
      manager.onPoseReceived(validPose);
      manager.onPoseLost();

      expect(manager.getLastValidPose()).toEqual(validPose);
    });

    it('does not call onTrackingLost if already lost', () => {
      manager.onPoseReceived(validPose);
      manager.onPoseLost();
      manager.onPoseLost();

      expect(callbacks.onTrackingLost).toHaveBeenCalledOnce();
    });

    it('does not call onTrackingLost if never tracked', () => {
      manager.onPoseLost();
      expect(callbacks.onTrackingLost).not.toHaveBeenCalled();
    });
  });

  describe('tracking restart detection', () => {
    const initialPose: ARPose = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };

    const newPose: ARPose = {
      position: { x: 0.1, y: 0.1, z: 0.1 },
      orientation: { x: 0, y: 0.1, z: 0, w: 0.995 },
    };

    it('calls onTrackingRestarted when pose resumes after loss with origin reset', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledOnce();
    });

    /**
     * Why this test matters:
     * lastValidOdomPos must be raw WebXR (the reducer applies webxrToNUE
     * before adding to odometryPosOffset). Raw WebXR {x:1, y:2, z:3}
     * → extractOdomPosition → [1, 2, 3].
     */
    it('provides lastValidOdomPos in raw WebXR convention', () => {
      // Set up device orientation
      vi.mocked(callbacks.getDeviceOrientation).mockReturnValue({
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      });

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledWith(
        expect.objectContaining({
          lastValidOdomPos: [1, 2, 3],
          lastValidOdomRot: [0, 0, 0, 1],
          newOdomRot: [0, 0.1, 0, 0.995],
        })
      );
    });

    /**
     * Why this test matters:
     * newOdomPos is raw WebXR (the reducer applies webxrToNUE).
     * WebXR {x:0.1, y:0.1, z:0.1} → [0.1, 0.1, 0.1]
     */
    it('includes newOdomPos in raw WebXR convention', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];
      expect(payload.newOdomPos).toEqual([0.1, 0.1, 0.1]);
    });

    /**
     * Why this test matters:
     * When markOriginReset is called with a transform (from XRReferenceSpaceEvent),
     * the transform must flow through to the payload for diagnostic recording.
     */
    it('includes resetTransform in payload when provided', () => {
      const transform = {
        position: [0.5, 0, -0.3] as [number, number, number],
        orientation: [0, 0.1, 0, 0.995] as [number, number, number, number],
      };

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset(transform);
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];
      expect(payload.resetTransform).toEqual(transform);
    });

    /**
     * Why this test matters:
     * When the XR runtime cannot determine the delta between old and new
     * coordinate systems, transform is null. This must be preserved as null
     * (not undefined) in the payload to distinguish "null transform" from
     * "no reset event".
     */
    it('includes null resetTransform when transform not available', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset(null);
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];
      expect(payload.resetTransform).toBeNull();
    });

    /**
     * Why this test matters:
     * Backwards compatibility: callers that call markOriginReset() without
     * arguments should produce a payload with resetTransform === undefined.
     * Per OdometryTrackingRestartedPayload docs, undefined means "the reset
     * event did not provide a transform (older browsers or no event)" while
     * null means "the runtime explicitly could not determine the delta".
     */
    it('handles markOriginReset called without arguments (undefined, not null)', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];
      expect(payload.resetTransform).toBeUndefined();
    });

    it('transitions back to TRACKING after restart', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.onPoseReceived(newPose);

      expect(manager.getState()).toBe(TrackingState.TRACKING);
    });

    it('handles multiple lost-restart cycles', () => {
      manager.onPoseReceived(initialPose);

      // First cycle (origin reset)
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      // Second cycle (origin reset)
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(initialPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledTimes(2);
      expect(callbacks.onTrackingLost).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('resets to INITIALIZING state', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);
      manager.reset();

      expect(manager.getState()).toBe(TrackingState.INITIALIZING);
    });

    it('clears last valid pose', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);
      manager.reset();

      expect(manager.getLastValidPose()).toBeNull();
    });

    /**
     * Why this test matters:
     * After reset(), the lostFrameCount should be 0 so a new session
     * starts fresh without stale tracking loss data.
     */
    it('clears lostFrameCount', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);
      manager.onPoseLost();
      manager.onPoseLost();
      manager.onPoseLost();
      expect(manager.getLostFrameCount()).toBe(3);

      manager.reset();

      expect(manager.getLostFrameCount()).toBe(0);
    });
  });

  describe('getLostFrameCount', () => {
    it('returns 0 when tracking', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);

      expect(manager.getLostFrameCount()).toBe(0);
    });

    it('increments on each null pose frame', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);
      manager.onPoseLost();
      manager.onPoseLost();
      manager.onPoseLost();

      expect(manager.getLostFrameCount()).toBe(3);
    });

    it('resets when tracking resumes', () => {
      const pose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      manager.onPoseReceived(pose);
      manager.onPoseLost();
      manager.onPoseLost();
      manager.onPoseReceived(pose);

      expect(manager.getLostFrameCount()).toBe(0);
    });
  });

  describe('raw-storage pattern: raw Euler angles in payload', () => {
    /**
     * Why this test matters:
     * The raw-storage pattern mandates that action payloads contain raw sensor
     * values, with conversions happening in the reducer. The tracking-restart
     * payload should store raw Euler angles (like recordGpsEvent stores
     * rawDeviceOrientation) so they can be re-derived if eulerToQuaternion
     * is ever corrected again.
     */
    it('includes lastSensorOrientation with raw Euler angles', () => {
      vi.mocked(callbacks.getDeviceOrientation).mockReturnValue({
        alpha: 90,
        beta: 45,
        gamma: 30,
        absolute: false,
      });

      const initialPose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      const newPose: ARPose = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];

      expect(payload.lastSensorOrientation).toBeDefined();
      expect(payload.lastSensorOrientation!.alpha).toBe(90);
      expect(payload.lastSensorOrientation!.beta).toBe(45);
      expect(payload.lastSensorOrientation!.gamma).toBe(30);
    });

    it('includes newSensorOrientation with current Euler angles at restart', () => {
      let currentOrientation = {
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      };

      const customCallbacks: TrackingStateCallbacks = {
        onTrackingLost: vi.fn(),
        onTrackingRestarted: vi.fn(),
        getDeviceOrientation: () => currentOrientation,
      };
      const customManager = new TrackingStateManager(customCallbacks);

      const initialPose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      customManager.onPoseReceived(initialPose);
      currentOrientation = { alpha: 180, beta: 45, gamma: 30, absolute: false };
      customManager.onPoseLost();
      customManager.markOriginReset();
      customManager.onPoseReceived({
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });

      const payload = vi.mocked(customCallbacks.onTrackingRestarted).mock
        .calls[0][0];

      expect(payload.newSensorOrientation).toBeDefined();
      expect(payload.newSensorOrientation!.alpha).toBe(180);
      expect(payload.newSensorOrientation!.beta).toBe(45);
      expect(payload.newSensorOrientation!.gamma).toBe(30);
    });
  });

  describe('quaternion conversion integration', () => {
    /**
     * Why this test matters:
     * Verifies that raw sensor Euler angles are preserved in the payload
     * (raw-storage pattern). The reducer performs the eulerToQuaternion
     * conversion, not the action creator.
     */
    it('preserves raw sensor Euler angles for alpha=90 in payload', () => {
      vi.mocked(callbacks.getDeviceOrientation).mockReturnValue({
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      });

      const initialPose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      const newPose: ARPose = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];

      // Raw Euler angles must be preserved — reducer converts to quaternion
      expect(payload.lastSensorOrientation).toEqual({
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      });
      // Legacy lastSensorRot should not be set (conversion moved to reducer)
      expect(payload.lastSensorRot).toBeUndefined();
    });

    /**
     * Why this test matters:
     * Raw Euler angles in both lastSensorOrientation and newSensorOrientation
     * must be RawDeviceOrientation-shaped (alpha, beta, gamma, absolute).
     */
    it('includes well-formed RawDeviceOrientation for both sensor orientations', () => {
      vi.mocked(callbacks.getDeviceOrientation).mockReturnValue({
        alpha: 45,
        beta: 30,
        gamma: 15,
        absolute: false,
      });

      const initialPose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      const newPose: ARPose = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];

      // Both orientations should be well-formed RawDeviceOrientation
      expect(payload.lastSensorOrientation).toEqual({
        alpha: 45,
        beta: 30,
        gamma: 15,
        absolute: false,
      });
      expect(payload.newSensorOrientation).toEqual({
        alpha: 45,
        beta: 30,
        gamma: 15,
        absolute: false,
      });
    });

    /**
     * Why this test matters:
     * The lastSensorOrientation in the restart payload must use the orientation
     * that was captured WHEN tracking was active, not the current orientation
     * at the time of restart. This ensures the reducer computes alignment
     * correction using the correct reference frame.
     */
    it('uses captured orientation for lastSensorOrientation, not current', () => {
      // Orientation when tracking was active
      const orientationDuringTracking = {
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      };
      // Orientation changed during tracking loss
      const orientationAtRestart = {
        alpha: 180,
        beta: 45,
        gamma: 30,
        absolute: false,
      };

      let currentOrientation = orientationDuringTracking;

      const customCallbacks: TrackingStateCallbacks = {
        onTrackingLost: vi.fn(),
        onTrackingRestarted: vi.fn(),
        getDeviceOrientation: () => currentOrientation,
      };
      const customManager = new TrackingStateManager(customCallbacks);

      const initialPose: ARPose = {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      // Receive pose while orientation is at 90°
      customManager.onPoseReceived(initialPose);

      // Orientation changes during tracking loss
      currentOrientation = orientationAtRestart;

      customManager.onPoseLost();
      customManager.markOriginReset();

      // Receive new pose to trigger restart
      const newPose: ARPose = {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      customManager.onPoseReceived(newPose);

      const payload = vi.mocked(customCallbacks.onTrackingRestarted).mock
        .calls[0][0];

      // lastSensorOrientation should use orientation captured during tracking (90°)
      expect(payload.lastSensorOrientation).toEqual({
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      });

      // newSensorOrientation should use current orientation (180°, 45°, 30°)
      expect(payload.newSensorOrientation).toEqual({
        alpha: 180,
        beta: 45,
        gamma: 30,
        absolute: false,
      });

      // Verify they are different (the key assertion)
      expect(payload.lastSensorOrientation).not.toEqual(
        payload.newSensorOrientation
      );
    });
  });

  describe('edge cases', () => {
    /**
     * Why this test matters:
     * If tracking restarts before any pose was ever received (INITIALIZING state),
     * there's no lastValidPose to include in the payload. The manager should
     * handle this gracefully without crashing.
     */
    it('handles restart attempt with no previous valid pose', () => {
      // Go straight to LOST without ever having a valid pose
      // This simulates starting the app and immediately losing tracking
      manager.onPoseLost();

      // This should not throw or dispatch
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      manager.onPoseReceived({
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });

      // Should not call onTrackingRestarted since there was no lastValidPose
      expect(callbacks.onTrackingRestarted).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    /**
     * Why this test matters:
     * Verifies that sensor orientation fallback works when lastSensorOrientation
     * is null (i.e., orientation was never captured before tracking loss).
     * The payload should use the current orientation for both fields.
     */
    it('uses current sensor orientation as fallback when no previous captured', () => {
      // Setup with custom orientation getter
      let currentOrientation = { alpha: 0, beta: 0, gamma: 0, absolute: false };
      const customCallbacks: TrackingStateCallbacks = {
        onTrackingLost: vi.fn(),
        onTrackingRestarted: vi.fn(),
        getDeviceOrientation: () => currentOrientation,
      };
      const customManager = new TrackingStateManager(customCallbacks);

      // Receive pose and immediately lose tracking (no orientation captured)
      customManager.onPoseReceived({
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });

      // Change orientation during tracking loss
      currentOrientation = { alpha: 90, beta: 45, gamma: 30, absolute: false };

      customManager.onPoseLost();
      customManager.markOriginReset();

      // Receive new pose to trigger restart
      customManager.onPoseReceived({
        position: { x: 4, y: 5, z: 6 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });

      expect(customCallbacks.onTrackingRestarted).toHaveBeenCalled();
      const payload = vi.mocked(customCallbacks.onTrackingRestarted).mock
        .calls[0][0];
      // newSensorOrientation should use the current orientation (90, 45, 30)
      expect(payload.newSensorOrientation).toBeDefined();
      expect(payload.newSensorOrientation!.alpha).toBe(90);
      expect(payload.newSensorOrientation!.beta).toBe(45);
      expect(payload.newSensorOrientation!.gamma).toBe(30);
    });
  });

  describe('origin reset detection (Phase 2)', () => {
    const initialPose: ARPose = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };
    const newPose: ARPose = {
      position: { x: 0.1, y: 0.1, z: 0.1 },
      orientation: { x: 0, y: 0.1, z: 0, w: 0.995 },
    };

    /**
     * Why this test matters:
     * When tracking is lost and resumes WITHOUT an XRReferenceSpace reset event,
     * the coordinate frame is unchanged (Case 1: seamless recovery). The manager
     * must NOT dispatch onTrackingRestarted to avoid clearing valid alignment data.
     */
    it('does NOT call onTrackingRestarted for seamless recovery (no origin reset)', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      // No markOriginReset() call — seamless recovery
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).not.toHaveBeenCalled();
    });

    /**
     * Why this test matters:
     * When tracking is lost and the XRReferenceSpace reset event fires,
     * the coordinate frame has changed (Case 2: relocalization). The manager
     * MUST dispatch onTrackingRestarted so the store clears old data and
     * accumulates the offset for the new frame.
     */
    it('calls onTrackingRestarted when origin reset was flagged during loss', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset(); // XRReferenceSpace reset event fired
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledOnce();
    });

    /**
     * Why this test matters:
     * The origin reset flag must be consumed (cleared) after a LOST→TRACKING
     * transition so that subsequent seamless recoveries are not mistakenly
     * treated as resets.
     */
    it('clears the origin reset flag after processing', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      // First cycle: dispatched
      expect(callbacks.onTrackingRestarted).toHaveBeenCalledOnce();

      // Second cycle: seamless recovery — no reset flagged
      manager.onPoseLost();
      manager.onPoseReceived(initialPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledOnce(); // still once
    });

    /**
     * Why this test matters:
     * The onTrackingRecovered callback signals a seamless recovery (Case 1)
     * so the app can update UI (e.g., clear the "LOST" warning) without
     * dispatching odometryTrackingRestarted.
     */
    it('calls onTrackingRecovered for seamless recovery', () => {
      const onTrackingRecovered = vi.fn();
      const customCallbacks: TrackingStateCallbacks = {
        ...callbacks,
        onTrackingRecovered,
      };
      const customManager = new TrackingStateManager(customCallbacks);

      customManager.onPoseReceived(initialPose);
      customManager.onPoseLost();
      // No markOriginReset() — seamless recovery
      customManager.onPoseReceived(newPose);

      expect(onTrackingRecovered).toHaveBeenCalledOnce();
      expect(customCallbacks.onTrackingRestarted).not.toHaveBeenCalled();
    });

    /**
     * Why this test matters:
     * When an origin reset occurs, onTrackingRecovered should NOT fire —
     * only onTrackingRestarted. The two callbacks are mutually exclusive
     * per recovery event.
     */
    it('does NOT call onTrackingRecovered when origin reset occurred', () => {
      const onTrackingRecovered = vi.fn();
      const customCallbacks: TrackingStateCallbacks = {
        ...callbacks,
        onTrackingRecovered,
      };
      const customManager = new TrackingStateManager(customCallbacks);

      customManager.onPoseReceived(initialPose);
      customManager.onPoseLost();
      customManager.markOriginReset();
      customManager.onPoseReceived(newPose);

      expect(onTrackingRecovered).not.toHaveBeenCalled();
      expect(customCallbacks.onTrackingRestarted).toHaveBeenCalledOnce();
    });

    /**
     * Why this test matters:
     * Multiple rapid resets during a single LOST window should still produce
     * exactly one onTrackingRestarted dispatch when tracking resumes.
     * The resetTransform should be from the LAST markOriginReset call.
     */
    it('handles multiple markOriginReset calls during single LOST window', () => {
      const firstTransform = {
        position: [1, 0, 0] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
      };
      const secondTransform = {
        position: [2, 0, 0] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
      };

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset(firstTransform);
      manager.markOriginReset(secondTransform); // second reset event overwrites
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledOnce();
      const payload = vi.mocked(callbacks.onTrackingRestarted).mock.calls[0][0];
      expect(payload.resetTransform).toEqual(secondTransform);
    });

    /**
     * Why this test matters:
     * The resetTransform from one LOST→TRACKING cycle must NOT leak into
     * the next cycle. Each cycle should independently capture its own
     * transform (or null).
     */
    it('does not leak resetTransform between cycles', () => {
      const transform = {
        position: [1, 0, 0] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
      };

      // First cycle: with transform
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset(transform);
      manager.onPoseReceived(newPose);

      // Second cycle: with null transform
      manager.onPoseLost();
      manager.markOriginReset(null);
      manager.onPoseReceived(initialPose);

      const secondPayload = vi.mocked(callbacks.onTrackingRestarted).mock
        .calls[1][0];
      expect(secondPayload.resetTransform).toBeNull();
    });

    /**
     * Why this test matters:
     * markOriginReset() should be a no-op when not in LOST state — origin
     * resets only matter if pose delivery was interrupted.
     */
    it('ignores markOriginReset when not in LOST state', () => {
      manager.onPoseReceived(initialPose);
      manager.markOriginReset(); // while TRACKING — should be ignored

      manager.onPoseLost();
      manager.onPoseReceived(newPose);

      // No origin reset during this LOST window
      expect(callbacks.onTrackingRestarted).not.toHaveBeenCalled();
    });

    /**
     * Why this test matters:
     * reset() should clear the origin reset flag so a fresh session
     * doesn't inherit stale state from a previous session.
     */
    it('reset() clears the origin reset flag', () => {
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();

      manager.reset();

      // Start fresh session
      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      // No markOriginReset
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).not.toHaveBeenCalled();
    });

    /**
     * Why this test matters:
     * Verifies the correct NUE-converted payload is sent for an origin-reset
     * recovery, ensuring the reducer receives data in the right coordinate system.
     */
    it('provides correct NUE restart payload on origin reset', () => {
      vi.mocked(callbacks.getDeviceOrientation).mockReturnValue({
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      });

      manager.onPoseReceived(initialPose);
      manager.onPoseLost();
      manager.markOriginReset();
      manager.onPoseReceived(newPose);

      expect(callbacks.onTrackingRestarted).toHaveBeenCalledWith(
        expect.objectContaining({
          lastValidOdomPos: [1, 2, 3],
          lastValidOdomRot: [0, 0, 0, 1],
          newOdomRot: [0, 0.1, 0, 0.995],
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Issue 2 — Raw-storage pattern audit #2: `absolute` flag preservation
  // -------------------------------------------------------------------------
  describe('sensor orientation absolute flag (Issue 2 — audit #2)', () => {
    /**
     * Why this test matters:
     * The raw-storage pattern requires preserving all sensor values as-is in
     * the action payload. DeviceOrientationEvent.absolute indicates whether
     * alpha is relative to magnetic north (true) or arbitrary (false). Losing
     * this flag corrupts recorded data — analysis tools cannot determine
     * compass reliability for tracking restart events.
     */

    it('should preserve absolute=true from sensor in lastSensorOrientation', () => {
      const absoluteCallbacks: TrackingStateCallbacks = {
        onTrackingLost: vi.fn(),
        onTrackingRestarted: vi.fn(),
        getDeviceOrientation: vi
          .fn()
          // First call: during first onPoseReceived (stored as lastSensorOrientation)
          .mockReturnValueOnce({
            alpha: 90,
            beta: 45,
            gamma: 10,
            absolute: true,
          })
          // Second call: during recovery onPoseReceived (used as newSensorOrientation)
          .mockReturnValueOnce({
            alpha: 100,
            beta: 50,
            gamma: 15,
            absolute: true,
          }),
        onTrackingRecovered: vi.fn(),
      };
      const mgr = new TrackingStateManager(absoluteCallbacks);

      const pose1: ARPose = {
        position: { x: 1, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };
      const pose2: ARPose = {
        position: { x: 2, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      };

      mgr.onPoseReceived(pose1);
      mgr.onPoseLost();
      mgr.markOriginReset({ position: [0, 0, 0], orientation: [0, 0, 0, 1] });
      mgr.onPoseReceived(pose2);

      const payload = vi.mocked(absoluteCallbacks.onTrackingRestarted).mock
        .calls[0]![0];
      expect(payload.lastSensorOrientation!.absolute).toBe(true);
      expect(payload.newSensorOrientation!.absolute).toBe(true);
    });
  });
});
