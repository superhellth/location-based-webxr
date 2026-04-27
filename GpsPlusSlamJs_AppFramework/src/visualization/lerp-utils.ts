/**
 * Shared lerp utilities for visualization modules.
 *
 * Both alignment-lerper and camera-follower need the same smoothing
 * rate constant and clamped-alpha formula. Centralised here (R3) to
 * keep the two modules in sync.
 */

/** Default speed multiplier — ~90 % convergence in ~0.3 s at 60 fps. */
export const DEFAULT_LERP_RATE = 8;

/**
 * Compute a frame-rate-independent lerp/slerp factor clamped to [0, 1].
 *
 * @param lerpRate Speed multiplier (higher = faster convergence).
 * @param dt       Delta time in seconds since last frame.
 * @returns The interpolation alpha, guaranteed ≤ 1.0.
 */
export function clampedAlpha(lerpRate: number, dt: number): number {
  return Math.min(lerpRate * dt, 1.0);
}
