/**
 * Scene-graph node name constants.
 *
 * Used in .name assignments and getObjectByName() lookups.
 * Centralised here (R4) so a rename is a single-point change
 * with compile-time safety instead of grep-and-replace.
 */

export const SCENE_NODE = {
  /** Basis-change node (WebXR → NUE coordinate system) */
  BASIS_CHANGE: 'webxr-to-nue',
  /** Camera follower node (GPS-world-aligned, tracks camera position) */
  CAMERA_FOLLOWER: 'camera-follower',
} as const;
