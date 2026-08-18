/**
 * Global vitest setup for `gps-plus-slam-tour-builder`.
 *
 * Activates the `gps-plus-slam-js` library once at process start with the
 * bundled community key, so licensed math exports (`calcRelativeCoordsInMeters`
 * and friends, used by `src/app/viewing/ar-seams.ts`) are callable from tests
 * without each one first constructing a store.
 *
 * In the running app the same activation happens implicitly: the store
 * factories wrap `createSlamAppStore`, which activates the library — and both
 * app modes build their store before any geo math runs.
 *
 * Same pattern as `GpsPlusSlamJs_AppFramework/src/test-setup.ts`.
 */
// Both come through the framework's own re-export surface — TourBuilder
// depends on `gps-plus-slam-app-framework`, never on the closed core directly.
import { validateLicenseKey } from "gps-plus-slam-app-framework/core";
import { COMMUNITY_LICENSE_KEY } from "gps-plus-slam-app-framework/licensing";

validateLicenseKey(COMMUNITY_LICENSE_KEY);
