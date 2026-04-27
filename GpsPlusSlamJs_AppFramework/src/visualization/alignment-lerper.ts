/**
 * Alignment Lerper Module
 *
 * Smoothly interpolates arWorldGroup.matrix toward a target alignment
 * matrix each frame, eliminating visual jumps when the alignment solver
 * produces a new alignment (~1 Hz).
 *
 * Pattern: decompose → lerp position / slerp quaternion → compose.
 * Same lerpRate convention as camera-follower.ts (default 8 → ~90%
 * convergence in ~0.3 s at 60 fps).
 *
 * The first target is applied instantly (no animation from identity).
 *
 * @see docs/2026-03-21-user-feedback.md Issue 4
 */

import * as THREE from 'three';
import { DEFAULT_LERP_RATE, clampedAlpha } from './lerp-utils';

// Reusable scratch objects (avoid per-frame allocations)
const _currentPos = new THREE.Vector3();
const _currentQuat = new THREE.Quaternion();
const _currentScale = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _targetScale = new THREE.Vector3();

export interface AlignmentLerper {
  /**
   * Set the target alignment matrix. The arWorldGroup will lerp toward
   * this target on subsequent update() calls.
   *
   * @param matrix 16-element column-major matrix (gl-matrix mat4 / Three.js toArray format)
   */
  setTarget(matrix: readonly number[]): void;

  /**
   * Advance the interpolation by dt seconds. Call once per frame.
   *
   * @param dt Delta time in seconds since last frame.
   */
  update(dt: number): void;

  /** Lifecycle cleanup (no-op — lerper does not own arWorldGroup). */
  dispose(): void;
}

/**
 * Create an AlignmentLerper that drives arWorldGroup.matrix smoothly.
 *
 * @param arWorldGroup The group whose matrix is interpolated.
 * @param lerpRate     Lerp speed multiplier (default 8).
 */
export function createAlignmentLerper(
  arWorldGroup: THREE.Object3D,
  lerpRate = DEFAULT_LERP_RATE
): AlignmentLerper {
  let hasTarget = false;
  let isFirstTarget = true;

  // Stored decomposed target
  const storedTargetPos = new THREE.Vector3();
  const storedTargetQuat = new THREE.Quaternion();
  const storedTargetScale = new THREE.Vector3(1, 1, 1);

  const _matrix = new THREE.Matrix4();

  return {
    setTarget(matrix: readonly number[]): void {
      _matrix.fromArray(matrix);
      _matrix.decompose(storedTargetPos, storedTargetQuat, storedTargetScale);
      hasTarget = true;
    },

    update(dt: number): void {
      if (!hasTarget) {
        return;
      }

      if (isFirstTarget) {
        // First alignment — apply instantly, no lerp from identity
        _matrix.compose(storedTargetPos, storedTargetQuat, storedTargetScale);
        arWorldGroup.matrix.copy(_matrix);
        arWorldGroup.matrixAutoUpdate = false;
        arWorldGroup.updateMatrixWorld(true);
        isFirstTarget = false;
        return;
      }

      // Decompose current matrix
      arWorldGroup.matrix.decompose(_currentPos, _currentQuat, _currentScale);

      // Compute clamped alpha
      const alpha = clampedAlpha(lerpRate, dt);

      // Lerp position, slerp quaternion
      _currentPos.lerp(storedTargetPos, alpha);
      _currentQuat.slerp(storedTargetQuat, alpha);
      // Scale: lerp toward target (normally both are [1,1,1])
      _currentScale.lerp(storedTargetScale, alpha);

      // Recompose and write
      _matrix.compose(_currentPos, _currentQuat, _currentScale);
      arWorldGroup.matrix.copy(_matrix);
      arWorldGroup.matrixAutoUpdate = false;
      arWorldGroup.updateMatrixWorld(true);
    },

    dispose(): void {
      // No-op — lerper does not own arWorldGroup
    },
  };
}
