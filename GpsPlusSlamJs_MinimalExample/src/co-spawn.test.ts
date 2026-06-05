import { describe, expect, it } from 'vitest';
import { Group, Scene, Vector3 } from 'three';

import {
  ANCHOR_MODE,
  ANCHOR_SPHERE_RADIUS,
  CUBE_HALF_EXTENT,
  CUBE_SPAWN_OFFSET,
  coSpawnAtWorldPose,
} from './co-spawn.js';

/**
 * Why these tests matter: the contrast demo is only honest if the anchored
 * sphere sits exactly on the tapped GPS point (so `createGpsAnchor` does not
 * snap it on its first commit) AND both objects are *individually visible* from
 * the start. The first field test reported "I think there was only a single
 * object placed" — verified as a perception bug: the original port spawned a
 * 0.2 m cube and a coincident 0.2 m-diameter sphere at the EXACT same world
 * point, so the sphere sat inside/behind the cube and the pair read as one
 * blob. The fix keeps the anchor sphere on the tapped point (= its GPS seed,
 * so no first-commit snap) and offsets the deliberate floater CUBE by a small
 * fixed vector, so both are distinct at spawn while still close enough that the
 * cube's later drift away from the anchor is obvious. These tests pin: the
 * anchor lands on the tap (world-pose correct under arWorldGroup), the cube
 * lands at tap+offset under scene, the two are separated enough to be
 * individually visible (no occlusion — the reproduction guard), and the
 * required snap-when-offscreen mode.
 */
describe('coSpawnAtWorldPose', () => {
  it('places the anchor on the tap and the floater cube at tap+offset (world pose correct under different parents)', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    // Non-trivial alignment: translate + rotate the AR world group so a shared
    // *local* position would NOT coincide in world space.
    arWorldGroup.position.set(10, -1, 5);
    arWorldGroup.rotateY(Math.PI / 3);
    scene.updateMatrixWorld(true);

    const worldPosition = new Vector3(1, 2, 3);
    const { cube, anchorObject } = coSpawnAtWorldPose({
      scene,
      arWorldGroup,
      worldPosition: worldPosition.clone(),
    });

    scene.updateMatrixWorld(true);
    const cubeWorld = cube.getWorldPosition(new Vector3());
    const anchorWorld = anchorObject.getWorldPosition(new Vector3());

    // Anchor is exactly on the tapped point — it is handed to createGpsAnchor
    // with the tapped GPS seed, so a non-zero offset here would make the anchor
    // snap on its first steady-state commit.
    expect(anchorWorld.distanceTo(worldPosition)).toBeLessThan(1e-6);
    // The floater cube carries the fixed spawn offset (it has no GPS meaning).
    const expectedCubeWorld = worldPosition.clone().add(CUBE_SPAWN_OFFSET);
    expect(cubeWorld.distanceTo(expectedCubeWorld)).toBeLessThan(1e-6);
  });

  it('separates the two objects enough to be individually visible at spawn (no occlusion)', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    scene.updateMatrixWorld(true);

    const worldPosition = new Vector3(0, 0, 0);
    const { cube, anchorObject } = coSpawnAtWorldPose({
      scene,
      arWorldGroup,
      worldPosition: worldPosition.clone(),
    });
    scene.updateMatrixWorld(true);

    const centreGap = cube
      .getWorldPosition(new Vector3())
      .distanceTo(anchorObject.getWorldPosition(new Vector3()));
    // The centres must be farther apart than the sum of the two objects' visual
    // half-extents, so neither sits inside the other (the original bug: a
    // coincident pair read as one object). A clear gap remains.
    expect(centreGap).toBeGreaterThan(CUBE_HALF_EXTENT + ANCHOR_SPHERE_RADIUS);
  });

  it('parents the cube under scene and the anchor object under arWorldGroup', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    scene.updateMatrixWorld(true);

    const { cube, anchorObject } = coSpawnAtWorldPose({
      scene,
      arWorldGroup,
      worldPosition: new Vector3(0, 0, 0),
    });

    expect(cube.parent).toBe(scene);
    expect(anchorObject.parent).toBe(arWorldGroup);
  });

  it('uses snap-when-offscreen (keeps the teaching jump out of view)', () => {
    expect(ANCHOR_MODE).toBe('snap-when-offscreen');
  });
});
