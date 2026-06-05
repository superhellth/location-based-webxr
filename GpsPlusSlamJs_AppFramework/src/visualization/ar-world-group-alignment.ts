/**
 * `enableArWorldGroupAlignment` — wire the store's alignment matrix to a
 * smoothly-lerped `arWorldGroup.matrix`, as a single framework-default call.
 *
 * Why this exists: `arWorldGroup` is the AR-odometry node that the camera and
 * every GPS anchor live under. Applying the GPS+VIO alignment to its matrix is
 * what GPS-registers the *view* — the camera and all anchored content shift
 * together as the alignment refines, so anchors stay stable in the AR overlay
 * and only ever have to correct a small residual when they re-register. The
 * recorder already wires this by hand (its own `createAlignmentLerper` driven
 * from the frame loop); the two simpler apps never did, leaving the camera
 * pure-VIO and forcing each anchor to absorb the full alignment delta. This
 * helper folds the lerper + store subscription + frame-loop drive into one
 * call so no app can forget it.
 *
 * See
 * `gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-05-gps-anchor-frame-architecture-bug-and-plan.md`
 * (Slice 2 / Bug A) and the colocated sidecar.
 */
import type * as THREE from 'three';
import { createAlignmentLerper } from './alignment-lerper.js';
import { registerFrameUpdate } from '../ar/frame-loop.js';
import { subscribeToSelector } from '../state/subscribe-to-selector.js';
import type { SubscribableStore } from '../state/subscribe-to-selector.js';
import { selectAlignmentMatrix } from '../state/app-selectors.js';

export interface ArWorldGroupAlignmentOptions {
  /** The store whose alignment selector drives the lerper. */
  readonly store: SubscribableStore;
  /** The AR world group whose `.matrix` is lerped toward each alignment. */
  readonly arWorldGroup: THREE.Object3D;
  /**
   * Lerp speed multiplier forwarded to {@link createAlignmentLerper}
   * (default matches the lerper's own `DEFAULT_LERP_RATE`).
   */
  readonly lerpRate?: number;
}

export interface ArWorldGroupAlignmentHandle {
  /** Stop the subscription and the per-frame update. */
  dispose(): void;
}

/**
 * Begin applying the store's (lerped) alignment to `arWorldGroup`. Returns a
 * handle whose `dispose()` removes both the store subscription and the
 * per-frame update. Idempotency / double-drive is the caller's concern: the
 * recorder owns its own lerper and must NOT also call this (it would
 * double-lerp the same group).
 */
export function enableArWorldGroupAlignment(
  options: ArWorldGroupAlignmentOptions
): ArWorldGroupAlignmentHandle {
  const lerper = createAlignmentLerper(options.arWorldGroup, options.lerpRate);

  // Adopt an alignment that is already present when we enable. `subscribeToSelector`
  // only fires on *change*, so an app that enables after the first fix would
  // otherwise never register the view until the next alignment update.
  const current = selectAlignmentMatrix(options.store.getState());
  if (current !== null && current !== undefined) {
    lerper.setTarget(current);
  }

  const unsubscribe = subscribeToSelector(
    options.store,
    selectAlignmentMatrix,
    (matrix) => {
      if (matrix !== null && matrix !== undefined) {
        lerper.setTarget(matrix);
      }
    }
  );

  const unregister = registerFrameUpdate((dt) => {
    lerper.update(dt);
  });

  return {
    dispose(): void {
      unsubscribe();
      unregister();
      lerper.dispose();
    },
  };
}
