/**
 * Generic Failure Tracker Factory — Tests
 *
 * Why these tests matter:
 * The generic failure tracker extracts the shared pattern from
 * capture-failure-tracker and write-failure-tracker into a single
 * reusable factory. These tests define and protect the common contract:
 * consecutive failure counting, threshold-based warnings, once-only
 * semantics, and session-level reset.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFailureTracker } from './failure-tracker';

describe('failure-tracker (generic factory)', () => {
  let onWarning: (message: string) => void;

  beforeEach(() => {
    onWarning = vi.fn();
  });

  describe('createFailureTracker', () => {
    it('starts with zero failure count and hasWarned=false', () => {
      // Why this test matters: initial state must be clean
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'threshold reached',
        defaultThreshold: 3,
        onWarning,
      });

      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.hasWarned()).toBe(false);
    });

    it('increments failure count on each recordFailure call', () => {
      // Why this test matters: failure counting is the core mechanism
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'threshold reached',
        defaultThreshold: 3,
        onWarning,
      });

      tracker.recordFailure();
      expect(tracker.getFailureCount()).toBe(1);

      tracker.recordFailure();
      expect(tracker.getFailureCount()).toBe(2);
    });

    it('resets failure count on recordSuccess', () => {
      // Why this test matters: successful operations reset the streak
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'threshold reached',
        defaultThreshold: 3,
        onWarning,
      });

      tracker.recordFailure();
      tracker.recordFailure();
      tracker.recordSuccess();

      expect(tracker.getFailureCount()).toBe(0);
    });

    it('calls onWarning when consecutive failures reach the threshold', () => {
      // Why this test matters: core functionality — warn at threshold
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'things went wrong',
        defaultThreshold: 3,
        onWarning,
      });

      tracker.recordFailure();
      tracker.recordFailure();
      expect(onWarning).not.toHaveBeenCalled();

      tracker.recordFailure(); // threshold=3 reached
      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(onWarning).toHaveBeenCalledWith('things went wrong');
    });

    it('does not call onWarning more than once (no spamming)', () => {
      // Why this test matters: once warned, stay quiet until reset
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'oops',
        defaultThreshold: 2,
        onWarning,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // warning
      tracker.recordFailure(); // still above threshold
      tracker.recordFailure();

      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(tracker.hasWarned()).toBe(true);
    });

    it('does not re-warn after success resets count then threshold is hit again', () => {
      // Why this test matters: within a session, warn only once
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'oops',
        defaultThreshold: 2,
        onWarning,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // first warning
      tracker.recordSuccess(); // count resets, hasWarned stays true

      tracker.recordFailure();
      tracker.recordFailure(); // would reach threshold again
      expect(onWarning).toHaveBeenCalledTimes(1); // no second warning
    });

    it('reset() clears count AND hasWarned, allowing re-warning', () => {
      // Why this test matters: new session must start completely fresh
      const tracker = createFailureTracker({
        label: 'Test',
        warningMessage: 'oops',
        defaultThreshold: 2,
        onWarning,
      });

      tracker.recordFailure();
      tracker.recordFailure(); // warning #1
      tracker.reset();

      expect(tracker.getFailureCount()).toBe(0);
      expect(tracker.hasWarned()).toBe(false);

      tracker.recordFailure();
      tracker.recordFailure(); // warning #2 — allowed after reset
      expect(onWarning).toHaveBeenCalledTimes(2);
    });

    it('allows overriding threshold at creation time', () => {
      // Why this test matters: consumer modules specify different thresholds
      const tracker = createFailureTracker({
        label: 'Custom',
        warningMessage: 'custom warning',
        defaultThreshold: 5,
        onWarning,
        failureThreshold: 2, // override the default
      });

      tracker.recordFailure();
      tracker.recordFailure();
      expect(onWarning).toHaveBeenCalledTimes(1);
    });

    it('uses defaultThreshold when failureThreshold is not provided', () => {
      // Why this test matters: the factory's default should work
      const tracker = createFailureTracker({
        label: 'Defaults',
        warningMessage: 'default warning',
        defaultThreshold: 4,
        onWarning,
      });

      for (let i = 0; i < 3; i++) {
        tracker.recordFailure();
      }
      expect(onWarning).not.toHaveBeenCalled();

      tracker.recordFailure(); // 4th — hits defaultThreshold
      expect(onWarning).toHaveBeenCalledTimes(1);
    });

    it('passes the error argument through to recordFailure when provided', () => {
      // Why this test matters: write-failure-tracker passes an error object;
      // the generic factory's recordFailure accepts an optional error for logging
      const tracker = createFailureTracker({
        label: 'ErrorTest',
        warningMessage: 'with error',
        defaultThreshold: 5,
        onWarning,
      });

      // Should not throw when called with or without an error
      expect(() => tracker.recordFailure()).not.toThrow();
      expect(() => tracker.recordFailure(new Error('boom'))).not.toThrow();
      expect(tracker.getFailureCount()).toBe(2);
    });
  });

  describe('logLevel configuration', () => {
    it('defaults to "warn" level (does not throw)', () => {
      // Why this test matters: capture-failure-tracker uses warn, which is the default
      const tracker = createFailureTracker({
        label: 'WarnLevel',
        warningMessage: 'warning',
        defaultThreshold: 1,
        onWarning,
      });

      expect(() => tracker.recordFailure()).not.toThrow();
    });

    it('accepts "error" level (does not throw)', () => {
      // Why this test matters: write-failure-tracker uses error level
      const tracker = createFailureTracker({
        label: 'ErrorLevel',
        warningMessage: 'warning',
        defaultThreshold: 1,
        onWarning,
        logLevel: 'error',
      });

      expect(() => tracker.recordFailure(new Error('test'))).not.toThrow();
    });
  });
});
