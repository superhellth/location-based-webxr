import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';

import { createReticleMesh, updateReticle } from './hit-test-reticle.js';

/**
 * Why these tests matter: the reticle view-model is the small piece of the
 * hit-test glue most likely to be ported incorrectly. We pin two invariants
 * that the per-frame XR plumbing in each app relies on every frame:
 *   1. a hit pose makes the reticle visible AND adopts the pose verbatim, and
 *   2. the absence of a hit hides the reticle (otherwise a stale reticle would
 *      stick to the last surface).
 */
describe('createReticleMesh', () => {
  it('starts hidden with manual matrix updates (so the hit pose is not clobbered)', () => {
    const reticle = createReticleMesh();
    expect(reticle.visible).toBe(false);
    expect(reticle.matrixAutoUpdate).toBe(false);
  });
});

describe('updateReticle', () => {
  it('adopts the hit pose matrix and shows the reticle', () => {
    const reticle = new Object3D();
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    // A pose translated to (1, 2, 3): column-major identity with translation in
    // the last column's first three rows (elements 12,13,14).
    const pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    updateReticle(reticle, pose);

    expect(reticle.visible).toBe(true);
    expect(reticle.matrix.elements[12]).toBe(1);
    expect(reticle.matrix.elements[13]).toBe(2);
    expect(reticle.matrix.elements[14]).toBe(3);
  });

  it('hides the reticle when there is no hit (null)', () => {
    const reticle = new Object3D();
    reticle.visible = true;
    updateReticle(reticle, null);
    expect(reticle.visible).toBe(false);
  });

  it('accepts a Float32Array pose matrix (XRPose.transform.matrix shape)', () => {
    const reticle = new Object3D();
    reticle.matrixAutoUpdate = false;
    const pose = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1,
    ]);
    updateReticle(reticle, pose);
    expect(reticle.visible).toBe(true);
    expect(reticle.matrix.elements[14]).toBe(7);
  });
});
