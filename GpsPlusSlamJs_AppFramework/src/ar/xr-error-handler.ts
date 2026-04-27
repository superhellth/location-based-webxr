/**
 * WebXR Error Handler
 *
 * Provides user-facing error messages for WebXR session failures.
 * Separates error handling logic from AR module for testability.
 */

/**
 * Known WebXR error types and their user-friendly messages.
 */
export const XR_ERROR_MESSAGES: Record<string, string> = {
  NotSupportedError:
    'AR not supported on this device. Please ensure ARCore (Android) or ARKit (iOS) is installed.',
  SecurityError:
    'Camera permission denied. Allow camera access to use AR features.',
  InvalidStateError:
    'AR session already active. Please close other AR apps and try again.',
  NotAllowedError:
    'AR access not allowed. Check browser permissions for this site.',
};

/**
 * Default message for unknown error types.
 */
export const XR_ERROR_MESSAGE_UNKNOWN =
  'Failed to start AR session. Check device compatibility and permissions.';

/**
 * Get a user-friendly error message from a WebXR session error.
 *
 * @param error - The error thrown by navigator.xr.requestSession
 * @returns A user-friendly error message
 */
export function getXrErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    return XR_ERROR_MESSAGES[error.name] ?? XR_ERROR_MESSAGE_UNKNOWN;
  }

  if (error instanceof Error) {
    // Check if error message contains known patterns
    const msg = error.message.toLowerCase();
    if (msg.includes('not supported')) {
      return XR_ERROR_MESSAGES['NotSupportedError']!;
    }
    if (msg.includes('permission') || msg.includes('denied')) {
      return XR_ERROR_MESSAGES['SecurityError']!;
    }
  }

  return XR_ERROR_MESSAGE_UNKNOWN;
}
