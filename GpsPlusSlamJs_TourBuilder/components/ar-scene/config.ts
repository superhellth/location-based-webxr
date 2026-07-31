/**
 * Component 8 budgets. Every number the AR viewing scene relies on lives here,
 * never inline, and every one is overridable through `createTourScene` options
 * so a test can set `modelLruCapacity: 1` and prove eviction without building
 * four models (plan §8).
 *
 * The proximity radii and the hysteresis fraction are NOT here — radii are
 * per-waypoint data in `tour.json` (contract D2) and the hysteresis fraction
 * belongs to component 4 (contract §4).
 *
 * @see plans/2026-07-31-ar-scene-plan.md §8
 */

/** Parsed GLTF templates kept warm after their waypoint drops to IDLE (A9). */
export const MODEL_LRU_CAPACITY = 3;

/** `parseAsync` runs on the main thread; more than this re-introduces jank (A8). */
export const MAX_CONCURRENT_PARSES = 2;

/** Breadcrumb orb meshes+anchors allocated once and recycled (A3). */
export const TRAIL_ORB_POOL_SIZE = 16;

/**
 * Orbs are near-field guidance only (A4). Deliberately smaller than the default
 * 25 m prefetch radius: a knight starts loading well before its orbs appear, and
 * the 2D map (component 7) covers the far view. The value most likely to need
 * field tuning — too small and orbs pop in underfoot, too large and the trail is
 * visual noise.
 */
export const TRAIL_WINDOW_RADIUS_M = 15;

/**
 * Transcript panel offset below the visual, in metres (A14). Below, not above:
 * a label over a ~1.8 m knight falls outside a phone's portrait field of view
 * at typical tap distance.
 */
export const TRANSCRIPT_OFFSET_M = 0.9;
