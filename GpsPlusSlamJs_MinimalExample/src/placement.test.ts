import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';

import {
  createRootCube,
  decideTapPlacement,
  placeRootCube,
} from './placement.js';

/**
 * Why these tests matter: the GPS gate is the invariant that keeps the Step 4
 * contrast demo honest — both objects must spawn from the same global pose,
 * which is only knowable once a GPS fix exists. We pin that a pre-fix tap is a
 * no-op (waiting-for-gps) and a post-fix tap with a visible reticle places.
 */
describe('decideTapPlacement', () => {
  it('ignores a tap before the first GPS fix (waiting-for-gps)', () => {
    expect(decideTapPlacement({ hasGpsFix: false, reticleVisible: true })).toEqual({
      kind: 'waiting-for-gps',
    });
    // GPS gate takes precedence even when no surface is found.
    expect(decideTapPlacement({ hasGpsFix: false, reticleVisible: false })).toEqual({
      kind: 'waiting-for-gps',
    });
  });

  it('reports no-surface when GPS is ready but the reticle is hidden', () => {
    expect(decideTapPlacement({ hasGpsFix: true, reticleVisible: false })).toEqual({
      kind: 'no-surface',
    });
  });

  it('places when a GPS fix exists and a surface is under the reticle', () => {
    expect(decideTapPlacement({ hasGpsFix: true, reticleVisible: true })).toEqual({
      kind: 'place',
    });
  });
});

describe('placeRootCube', () => {
  it('parents the cube under the GPS-aligned scene root at the world position', () => {
    const scene = new Scene();
    const cube = placeRootCube(scene, new Vector3(1, 2, 3));

    // The deliberate-floater invariant: the cube is a child of `scene`
    // (GPS-aligned root), NOT an arWorldGroup. Drift here is the teaching point.
    expect(cube.parent).toBe(scene);
    expect(cube.position.x).toBe(1);
    expect(cube.position.y).toBe(2);
    expect(cube.position.z).toBe(3);
  });

  it('builds a distinct mesh per placement (no shared geometry handle leaks)', () => {
    const a = createRootCube();
    const b = createRootCube();
    expect(a).not.toBe(b);
    expect(a.geometry).not.toBe(b.geometry);
  });
});
