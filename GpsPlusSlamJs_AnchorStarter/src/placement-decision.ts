/**
 * Pure decision for the cache-miss "Place anchor" action.
 *
 * AnchorStarter places its anchor under a hit-test reticle (the "AR cursor"),
 * not at the user's own position. Two preconditions must hold for a press to
 * actually place:
 *
 *   1. A surface is currently under the screen centre (the reticle is visible).
 *      Without it there is no point to place at.
 *   2. The store carries a non-null GPS alignment. The reticle is parented under
 *      `arWorldGroup`, so its *world* pose is only expressed in GPS-world (NUE)
 *      coordinates once `arWorldGroup` carries the alignment. Before that the
 *      reticle's world pose is raw AR-local space and would commit the anchor to
 *      a meaningless GPS position.
 *
 * Keeping the gate pure lets us unit-test the "places iff reticle visible AND
 * alignment present, else emit the matching hint" contract without a DOM or a
 * WebXR session — the `main.ts` glue only reads `reticleVisible` /
 * `hasAlignment` off the live reticle handle + store and surfaces the hint
 * through the setup FSM (mirrors MinimalExample's `decideTapPlacement`).
 *
 * The FSM gate (`canPlaceAnchor`) is checked *before* this decision; this module
 * is only the surface/alignment layer.
 */

export type PlacementDecision =
  | { readonly kind: "place" }
  | { readonly kind: "blocked"; readonly hint: string };

export interface PlacementDecisionInput {
  /** Is a surface currently under the screen-centre reticle? */
  readonly reticleVisible: boolean;
  /** Does the store currently hold a non-null GPS alignment matrix? */
  readonly hasAlignment: boolean;
}

/** Hint shown when the user presses Place with no surface under the cursor. */
export const NO_SURFACE_HINT =
  "Point your phone at the ground until the marker ring appears, then tap Place.";

/** Hint shown when a surface is found but GPS alignment has not arrived yet. */
export const NO_ALIGNMENT_HINT =
  "Aligning to GPS — move around a little, then tap Place.";

/**
 * Decide whether a Place press should commit the anchor. Returns `place` only
 * when a surface is under the cursor AND alignment is present; otherwise returns
 * `blocked` with the most actionable hint (surface first, then alignment).
 */
export function decideAnchorPlacement(
  input: PlacementDecisionInput,
): PlacementDecision {
  if (!input.reticleVisible) {
    return { kind: "blocked", hint: NO_SURFACE_HINT };
  }
  if (!input.hasAlignment) {
    return { kind: "blocked", hint: NO_ALIGNMENT_HINT };
  }
  return { kind: "place" };
}
