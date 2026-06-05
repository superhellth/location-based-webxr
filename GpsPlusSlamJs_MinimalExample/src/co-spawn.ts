/**
 * Co-spawn helper for the Step 4 contrast demo.
 *
 * On a (GPS-gated) tap the example spawns two objects at the **same initial
 * global pose** but under different parents, to make the framework's
 * drift-compensation value proposition visible:
 *
 * - the **root cube** under the GPS-aligned `scene` (the deliberate floater —
 *   see placement.ts), and
 * - an **anchor marker** under `arWorldGroup`, handed to `createGpsAnchor` so it
 *   holds its tapped pose during bootstrap, then snaps to the GPS median when
 *   off-screen.
 *
 * This module is the pure geometry: it places both objects so their **world**
 * positions coincide across their different parent frames (the cube via a world
 * position under `scene`; the marker via the AR-local equivalent under
 * `arWorldGroup`). The live `createGpsAnchor` wiring (store-bound alignment
 * getters, GPS seed) stays in main.ts because it needs the running store; that
 * part is verified on-device. `ANCHOR_MODE` pins the plan's required
 * `snap-when-offscreen` behaviour so a future edit can't silently change it.
 */
import {
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  Vector3,
} from 'three';
import type { GpsAnchorMode } from 'gps-plus-slam-app-framework/visualization';

import { placeRootCube } from './placement.js';

/**
 * The anchor mode the example uses. `snap-when-offscreen` is required by the
 * plan: it keeps the teaching "jump" out of the user's view (the anchor only
 * corrects to the GPS median while off-screen).
 */
export const ANCHOR_MODE: GpsAnchorMode = 'snap-when-offscreen';

/** Radius (m) of the green anchor sphere. Modestly enlarged from the original
 * 0.1 m so it reads as a distinct marker at a few metres (first-field-test
 * "maybe the cube is just too small?"). */
export const ANCHOR_SPHERE_RADIUS = 0.15;

/** Half the edge length (m) of the 0.2 m orange floater cube. */
export const CUBE_HALF_EXTENT = 0.1;

/**
 * Fixed world-space offset of the deliberate floater **cube** from the tapped
 * point. The anchored sphere stays exactly on the tap (= its GPS seed, so
 * `createGpsAnchor` does not snap it on first commit); the cube — which has no
 * GPS meaning — is offset a short distance to the side so the two objects are
 * individually visible at spawn instead of occluding into one blob (the
 * "looked like one object" field-test report). The cube then visibly drifts
 * further from the anchor over time, which is the whole point of the demo.
 */
export const CUBE_SPAWN_OFFSET = new Vector3(0.5, 0, 0);

/** Build the anchor marker — a green sphere, visually distinct from the
 * orange floater cube. Internal to this module (used by `coSpawnAtWorldPose`). */
function createAnchorMarker(): Mesh {
  return new Mesh(
    new SphereGeometry(ANCHOR_SPHERE_RADIUS, 16, 12),
    new MeshStandardMaterial({ color: 0x66ff99 })
  );
}

export interface CoSpawnResult {
  /** The deliberate floater, parented under the GPS-aligned scene root. */
  readonly cube: Mesh;
  /** The anchor's object3D, parented under `arWorldGroup` (hand to createGpsAnchor). */
  readonly anchorObject: Mesh;
}

/**
 * Place both objects so they are individually visible at spawn.
 *
 * The anchor marker goes under `arWorldGroup` at the AR-local equivalent of the
 * tapped world point (so it coincides with its GPS seed and `createGpsAnchor`
 * never snaps it on the first commit). The floater cube goes under `scene` at
 * `worldPosition + CUBE_SPAWN_OFFSET`, a short fixed distance to the side, so
 * the orange cube and green sphere don't occlude into a single blob.
 * `arWorldGroup`'s world matrix is refreshed first so the world→local
 * conversion uses the current transform.
 */
export function coSpawnAtWorldPose(opts: {
  scene: Object3D;
  arWorldGroup: Object3D;
  worldPosition: Vector3;
}): CoSpawnResult {
  const { scene, arWorldGroup, worldPosition } = opts;

  const cube = placeRootCube(
    scene,
    worldPosition.clone().add(CUBE_SPAWN_OFFSET)
  );

  const anchorObject = createAnchorMarker();
  arWorldGroup.add(anchorObject);
  arWorldGroup.updateWorldMatrix(true, false);
  anchorObject.position.copy(arWorldGroup.worldToLocal(worldPosition.clone()));

  return { cube, anchorObject };
}
