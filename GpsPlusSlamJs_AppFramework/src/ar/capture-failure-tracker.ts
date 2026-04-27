/**
 * Capture Failure Tracker
 *
 * Tracks consecutive image capture failures and notifies users when
 * multiple frames fail to capture (e.g., low memory on mobile devices).
 *
 * Field Test Readiness Issue #11: Silent image capture failures
 *
 * Thin wrapper around the generic failure tracker factory.
 */

import {
  createFailureTracker,
  type FailureTracker,
} from '../utils/failure-tracker';

/**
 * Configuration for the capture failure tracker.
 */
export interface CaptureFailureTrackerConfig {
  /**
   * Number of consecutive failures before warning the user.
   * Default: 5 (higher than write failures since capture failures are less critical)
   */
  failureThreshold: number;

  /**
   * Callback to show error to user.
   */
  onWarning: (message: string) => void;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CAPTURE_TRACKER_CONFIG: Omit<
  CaptureFailureTrackerConfig,
  'onWarning'
> = {
  failureThreshold: 5,
};

/**
 * User-facing warning message when threshold is exceeded.
 */
export const CAPTURE_FAILURE_WARNING =
  'Multiple image captures failed. Device may be low on memory.';

/**
 * Tracks consecutive capture failures and warns user when threshold is exceeded.
 */
export interface CaptureFailureTracker {
  recordSuccess(): void;
  recordFailure(): void;
  getFailureCount(): number;
  hasWarned(): boolean;
  reset(): void;
}

/**
 * Create a new capture failure tracker.
 *
 * @param config - Configuration with warning callback and optional threshold
 * @returns CaptureFailureTracker instance
 */
export function createCaptureFailureTracker(
  config: Partial<CaptureFailureTrackerConfig> &
    Pick<CaptureFailureTrackerConfig, 'onWarning'>
): CaptureFailureTracker {
  const tracker: FailureTracker = createFailureTracker({
    label: 'CaptureFailure',
    warningMessage: CAPTURE_FAILURE_WARNING,
    defaultThreshold: DEFAULT_CAPTURE_TRACKER_CONFIG.failureThreshold,
    onWarning: config.onWarning,
    failureThreshold: config.failureThreshold,
    logLevel: 'warn',
  });

  return {
    recordSuccess: () => tracker.recordSuccess(),
    recordFailure: () => tracker.recordFailure(),
    getFailureCount: () => tracker.getFailureCount(),
    hasWarned: () => tracker.hasWarned(),
    reset: () => tracker.reset(),
  };
}
