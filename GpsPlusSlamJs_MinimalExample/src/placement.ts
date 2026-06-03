/**
 * Tap-to-place view-model for the minimal GPS + AR example.
 *
 * Two concerns, both deliberately pure so they can be unit-tested without a
 * WebXR session:
 *
 * 1. `decideTapPlacement` — the GPS gate. Per the plan's RECORDED decision, a
 *    tap is ignored until the first GPS fix has arrived (show a brief
 *    "waiting for GPS…" hint instead of placing). This preserves the
 *    shared-start-pose invariant for the contrast demo in Step 4: both the root
 *    cube and the GPS anchor are only ever spawned once a GPS fix exists.
 *
 * 2. `placeRootCube` — parents the placed cube under the **GPS-aligned scene
 *    root** (`getScene()`), NOT `arWorldGroup`. This is the _intentional_
 *    floater: with no drift compensation, a scene-root child visibly drifts as
 *    SLAM tracking and GPS disagree. Step 4 co-spawns a `createGpsAnchor` under
 *    `arWorldGroup` at the same world pose to contrast the two behaviours.
 */
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  type Vector3,
} from 'three';

/** Outcome of a tap, given the current GPS + reticle state. */
export type PlacementDecision =
  /** A GPS fix exists and a surface is under the screen centre — place now. */
  | { readonly kind: 'place' }
  /** No GPS fix yet — ignore the tap, show a "waiting for GPS…" hint. */
  | { readonly kind: 'waiting-for-gps' }
  /** GPS is ready but no surface is under the reticle — nothing to place on. */
  | { readonly kind: 'no-surface' };

/** Inputs to the GPS gate at the moment of a tap. */
export interface TapInput {
  /** Has at least one GPS fix been received since AR started? */
  readonly hasGpsFix: boolean;
  /** Is the hit-test reticle currently visible (a surface was found)? */
  readonly reticleVisible: boolean;
}

/**
 * Decide what a tap should do. GPS gating takes precedence over the surface
 * check so a pre-fix tap always surfaces the "waiting for GPS…" hint rather
 * than silently doing nothing.
 */
export function decideTapPlacement(input: TapInput): PlacementDecision {
  if (!input.hasGpsFix) {
    return { kind: 'waiting-for-gps' };
  }
  if (!input.reticleVisible) {
    return { kind: 'no-surface' };
  }
  return { kind: 'place' };
}

/**
 * Build the root cube — a 20cm box. Kept small so it reads as a placed marker.
 */
export function createRootCube(): Mesh {
  return new Mesh(
    new BoxGeometry(0.2, 0.2, 0.2),
    new MeshStandardMaterial({ color: 0xff7043 })
  );
}

/**
 * Place a freshly-built root cube under the GPS-aligned scene root at the given
 * **world** position. Returns the cube so callers can keep a handle to it.
 *
 * The cube is intentionally parented to `scene` (not `arWorldGroup`) — see the
 * module header: this is the deliberate floater of the contrast demo.
 */
export function placeRootCube(scene: Object3D, worldPosition: Vector3): Mesh {
  const cube = createRootCube();
  cube.position.copy(worldPosition);
  scene.add(cube);
  return cube;
}
