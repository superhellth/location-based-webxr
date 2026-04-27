/**
 * Sensors module — GPS watch, device orientation, permission checking.
 */

// --- gps ---
export {
  type GpsPosition,
  type RawDeviceOrientation,
  startGpsWatch,
  stopGpsWatch,
  startOrientationWatch,
  stopOrientationWatch,
  requestOrientationPermission as requestDeviceOrientationPermission,
} from './gps.js';

// --- gps-error-handler ---
export {
  GPS_ERROR_CODES,
  GPS_ERROR_MESSAGES,
  GPS_ERROR_MESSAGE_UNKNOWN,
  getGpsErrorMessage,
  createGpsErrorHandler,
} from './gps-error-handler.js';

// --- permission-checker ---
export {
  type PermissionStatus,
  type PermissionCheckResult,
  resetFileSystemState,
  setFileSystemState,
  checkFileSystemPermission,
  checkWebXRSupport,
  checkGeolocationPermission,
  requestGeolocationPermission,
  checkCameraPermission,
  requestCameraPermission,
  checkOrientationPermission,
  requestOrientationPermission,
  checkAllPermissions,
  requestAllPermissions,
  requestWebXRWithDepthPermission,
} from './permission-checker.js';
