/**
 * Write Failure Tracker
 *
 * Tracks consecutive file write failures and notifies users when
 * storage may be having issues (e.g., disk full, permission revoked).
 *
 * Field Test Readiness Issue #7: Silent image write failures
 *
 * Thin wrapper around the generic failure tracker factory.
 */

import {
  createFailureTracker,
  type FailureTracker,
} from 'gps-plus-slam-app-framework/utils/failure-tracker';

/**
 * Configuration for the write failure tracker.
 */
interface WriteFailureTrackerConfig {
  /**
   * Number of consecutive failures before warning the user.
   * Default: 3
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
export const DEFAULT_TRACKER_CONFIG: Omit<
  WriteFailureTrackerConfig,
  'onWarning'
> = {
  failureThreshold: 3,
};

/**
 * User-facing warning message when threshold is exceeded.
 */
export const WRITE_FAILURE_WARNING =
  'Multiple frame write failures. Storage may be full or unavailable.';

/**
 * Tracks consecutive write failures and warns user when threshold is exceeded.
 */
export interface WriteFailureTracker {
  recordSuccess(): void;
  recordFailure(error: unknown): void;
  getFailureCount(): number;
  hasWarned(): boolean;
  reset(): void;
}

/**
 * Create a new write failure tracker.
 *
 * @param config - Configuration with warning callback and optional threshold
 * @returns WriteFailureTracker instance
 */
export function createWriteFailureTracker(
  config: Partial<WriteFailureTrackerConfig> &
    Pick<WriteFailureTrackerConfig, 'onWarning'>
): WriteFailureTracker {
  const tracker: FailureTracker = createFailureTracker({
    label: 'WriteFailure',
    warningMessage: WRITE_FAILURE_WARNING,
    defaultThreshold: DEFAULT_TRACKER_CONFIG.failureThreshold,
    onWarning: config.onWarning,
    failureThreshold: config.failureThreshold,
    logLevel: 'error',
  });

  return {
    recordSuccess: () => tracker.recordSuccess(),
    recordFailure: (error: unknown) => tracker.recordFailure(error),
    getFailureCount: () => tracker.getFailureCount(),
    hasWarned: () => tracker.hasWarned(),
    reset: () => tracker.reset(),
  };
}
