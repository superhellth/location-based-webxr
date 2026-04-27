/**
 * Capture Failure Tracker Tests
 *
 * Why these tests matter (Issue #11 - Field Test Readiness):
 * When canvas.toBlob() fails (e.g., low memory on mobile), image captures
 * are silently skipped. This tracker ensures users are warned after multiple
 * consecutive capture failures so they know images aren't being recorded.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCaptureFailureTracker,
  CAPTURE_FAILURE_WARNING,
  DEFAULT_CAPTURE_TRACKER_CONFIG,
} from './capture-failure-tracker';

describe('capture-failure-tracker', () => {
  describe('DEFAULT_CAPTURE_TRACKER_CONFIG', () => {
    it('has sensible default values', () => {
      // Why this test matters: ensures defaults are reasonable
      // Higher threshold than write failures since capture failures are less critical
      expect(DEFAULT_CAPTURE_TRACKER_CONFIG.failureThreshold).toBe(5);
    });
  });

  describe('createCaptureFailureTracker', () => {
    let onWarning: (message: string) => void;

    beforeEach(() => {
      onWarning = vi.fn();
    });

    it('starts with zero failure count', () => {
      // Why this test matters: initial state should be clean
      const tracker = createCaptureFailureTracker({ onWarning });
      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.hasWarned()).toBe(false);
    });

    it('increments failure count on each recordFailure', () => {
      // Why this test matters: tracker must count failures correctly
      const tracker = createCaptureFailureTracker({ onWarning });

      tracker.recordFailure();
      expect(tracker.getFailureCount()).toBe(1);

      tracker.recordFailure();
      expect(tracker.getFailureCount()).toBe(2);
    });

    it('resets failure count on recordSuccess', () => {
      // Why this test matters: successful capture should reset failure streak
      const tracker = createCaptureFailureTracker({ onWarning });

      tracker.recordFailure();
      tracker.recordFailure();
      expect(tracker.getFailureCount()).toBe(2);

      tracker.recordSuccess();
      expect(tracker.getFailureCount()).toBe(0);
    });

    it('calls onWarning after threshold consecutive failures', () => {
      // Why this test matters: core functionality - warn user after N failures
      const tracker = createCaptureFailureTracker({
        onWarning,
        failureThreshold: 3,
      });

      tracker.recordFailure(); // 1
      tracker.recordFailure(); // 2
      expect(onWarning).not.toHaveBeenCalled();

      tracker.recordFailure(); // 3 - threshold reached
      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning).toHaveBeenCalledWith(CAPTURE_FAILURE_WARNING);
    });

    it('uses default threshold when not specified', () => {
      // Why this test matters: default threshold should work
      const tracker = createCaptureFailureTracker({ onWarning });

      // Record failures up to default threshold (5)
      for (let i = 0; i < 4; i++) {
        tracker.recordFailure();
      }
      expect(onWarning).not.toHaveBeenCalled();

      tracker.recordFailure(); // 5th failure
      expect(onWarning).toHaveBeenCalledTimes(1);
    });

    it('does not spam warnings after threshold', () => {
      // Why this test matters: once warned, don't annoy user repeatedly
      const tracker = createCaptureFailureTracker({
        onWarning,
        failureThreshold: 2,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // Threshold - first warning
      tracker.recordFailure(); // Above threshold
      tracker.recordFailure(); // Still above

      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(tracker.hasWarned()).toBe(true);
    });

    it('does not re-warn after success then more failures', () => {
      // Why this test matters: once warned in a session, stay quiet
      const tracker = createCaptureFailureTracker({
        onWarning,
        failureThreshold: 2,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // Warning shown
      expect(onWarning).toHaveBeenCalledTimes(1);

      tracker.recordSuccess(); // Reset count but not hasWarned
      tracker.recordFailure();
      tracker.recordFailure(); // Threshold again

      // Should not warn again
      expect(onWarning).toHaveBeenCalledTimes(1);
    });

    it('reset clears all state including hasWarned', () => {
      // Why this test matters: new session should start fresh
      const tracker = createCaptureFailureTracker({
        onWarning,
        failureThreshold: 2,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // Warning shown
      expect(tracker.hasWarned()).toBe(true);

      tracker.reset();

      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.hasWarned()).toBe(false);

      // Should be able to warn again after reset
      tracker.recordFailure();
      tracker.recordFailure();
      expect(onWarning).toHaveBeenCalledTimes(2);
    });
  });
});
