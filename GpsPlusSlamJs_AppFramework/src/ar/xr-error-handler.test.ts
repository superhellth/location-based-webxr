/**
 * WebXR Error Handler Tests
 *
 * Tests for user-facing XR error messages.
 *
 * Why these tests matter:
 * Field Test Readiness Issue #4 - When AR session fails to start,
 * users need specific guidance on what went wrong (camera denied,
 * ARCore missing, etc.) instead of a generic "Failed to start AR" message.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  getXrErrorMessage,
  XR_ERROR_MESSAGES,
  XR_ERROR_MESSAGE_UNKNOWN,
} from './xr-error-handler';

describe('XR Error Handler', () => {
  describe('getXrErrorMessage', () => {
    /**
     * Why this test matters:
     * NotSupportedError typically means ARCore/ARKit is not installed.
     * Users need to know to install the AR platform.
     */
    it('returns ARCore/ARKit message for NotSupportedError', () => {
      const error = new DOMException('Not supported', 'NotSupportedError');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['NotSupportedError']);
      expect(message).toContain('ARCore');
    });

    /**
     * Why this test matters:
     * SecurityError means camera permission was denied.
     * Users need to know to grant camera access.
     */
    it('returns camera permission message for SecurityError', () => {
      const error = new DOMException('Permission denied', 'SecurityError');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['SecurityError']);
      expect(message).toContain('Camera permission');
    });

    /**
     * Why this test matters:
     * InvalidStateError means another AR session is active.
     */
    it('returns session active message for InvalidStateError', () => {
      const error = new DOMException('Invalid state', 'InvalidStateError');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['InvalidStateError']);
    });

    /**
     * Why this test matters:
     * NotAllowedError means the site doesn't have AR permissions.
     */
    it('returns permissions message for NotAllowedError', () => {
      const error = new DOMException('Not allowed', 'NotAllowedError');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['NotAllowedError']);
    });

    /**
     * Why this test matters:
     * Unknown DOMException types should return a generic helpful message.
     */
    it('returns unknown message for unknown DOMException', () => {
      const error = new DOMException('Unknown', 'SomeOtherError');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGE_UNKNOWN);
    });

    /**
     * Why this test matters:
     * Regular Error objects with "not supported" in message should be recognized.
     */
    it('recognizes "not supported" in regular Error message', () => {
      const error = new Error('WebXR not supported on this browser');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['NotSupportedError']);
    });

    /**
     * Why this test matters:
     * Regular Error objects with "permission" in message should be recognized.
     */
    it('recognizes "permission" in regular Error message', () => {
      const error = new Error('Camera permission required');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['SecurityError']);
    });

    /**
     * Why this test matters:
     * Regular Error objects with "denied" in message should also be recognized.
     * This covers the second branch of the permission check.
     */
    it('recognizes "denied" in regular Error message', () => {
      const error = new Error('Access denied by user');

      const message = getXrErrorMessage(error);

      expect(message).toBe(XR_ERROR_MESSAGES['SecurityError']);
    });

    /**
     * Why this test matters:
     * Non-error values should return the generic message.
     */
    it('returns unknown message for non-error values', () => {
      expect(getXrErrorMessage(null)).toBe(XR_ERROR_MESSAGE_UNKNOWN);
      expect(getXrErrorMessage(undefined)).toBe(XR_ERROR_MESSAGE_UNKNOWN);
      expect(getXrErrorMessage('string error')).toBe(XR_ERROR_MESSAGE_UNKNOWN);
      expect(getXrErrorMessage(42)).toBe(XR_ERROR_MESSAGE_UNKNOWN);
    });
  });
});
