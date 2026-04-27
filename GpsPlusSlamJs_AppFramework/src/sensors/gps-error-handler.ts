/**
 * GPS Error Handler
 *
 * Provides user-facing error messages for GPS failures.
 * Separates error handling logic from GPS module for testability.
 */

import { createLogger } from '../utils/logger';

const log = createLogger('GPSError');

/**
 * GPS error codes from the Geolocation API.
 * Duplicated here to avoid depending on browser types in tests.
 */
export const GPS_ERROR_CODES = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
} as const;

/**
 * User-friendly error messages for each GPS error type.
 */
export const GPS_ERROR_MESSAGES: Record<number, string> = {
  [GPS_ERROR_CODES.PERMISSION_DENIED]:
    'GPS permission denied. Enable location access in your browser or device settings.',
  [GPS_ERROR_CODES.POSITION_UNAVAILABLE]:
    'GPS position unavailable. Move outdoors for better signal.',
  [GPS_ERROR_CODES.TIMEOUT]:
    'GPS timeout. Move outdoors or check that location services are enabled.',
};

/**
 * Default message for unknown error codes.
 */
export const GPS_ERROR_MESSAGE_UNKNOWN =
  'GPS error. Check your device settings.';

/**
 * Get a user-friendly error message for a GPS error.
 *
 * @param error - The GeolocationPositionError from the browser API
 * @returns A user-friendly error message
 */
export function getGpsErrorMessage(error: GeolocationPositionError): string {
  return GPS_ERROR_MESSAGES[error.code] ?? GPS_ERROR_MESSAGE_UNKNOWN;
}

/**
 * Create a GPS error handler that logs and shows user-facing errors.
 *
 * @param showError - Function to display error to user (e.g., from hud.ts)
 * @returns A function suitable for use as startGpsWatch's onError callback
 */
export function createGpsErrorHandler(
  showError: (message: string) => void
): (error: GeolocationPositionError) => void {
  return (error: GeolocationPositionError): void => {
    log.error(`GPS error (code ${error.code}):`, error.message);

    const userMessage = getGpsErrorMessage(error);
    showError(userMessage);
  };
}
