/**
 * Breadcrumb trail windowing (TASK.md §2.3.8: "laying out the trail of orbs").
 *
 * A recorded trail is a flat polyline of hundreds to thousands of points
 * (contract D7) — one anchored orb per point does not survive a 20-minute walk.
 * Instead a fixed pool of orbs is recycled across the points that currently
 * matter, and this module is the pure decision of *which* points those are and
 * *which pool slot* each goes to (plan A3/A4).
 *
 * The rule is deliberately the simplest one that works: **the nearest points
 * within a radius**, by horizontal X/Z distance (contract D17, the same metric
 * the proximity machine uses). No trail order, no direction, no dependency on
 * the next unvisited waypoint. Accepted consequence: where a route loops back on
 * itself, orbs from both passes can show at once.
 *
 * Slot assignment exists purely to avoid churn — an orb already sitting on a
 * still-selected point keeps its slot, so a frame typically re-points one orb
 * instead of sixteen.
 *
 * @see plans/2026-07-31-ar-scene-plan.md §6
 */

/** Ground-plane point. Y is ignored throughout (contract D17). */
export interface HorizontalPoint {
  readonly x: number;
  readonly z: number;
}

export interface TrailWindowConfig {
  /** Hard cap — the orb pool size. */
  readonly maxOrbs: number;
  /** Only points within this horizontal distance are candidates. */
  readonly radiusM: number;
}

/**
 * Choose the breadcrumb indices that should currently carry an orb.
 *
 * `points[i] === null` means "not convertible to world space yet" (no GPS zero
 * reference or no alignment matrix) — those are skipped rather than guessed at.
 * Returns indices in **ascending order** so the result is stable frame to frame;
 * the nearest-first ranking is only used to apply the cap.
 */
export function selectTrailWindow(
  points: readonly (HorizontalPoint | null)[],
  userPos: HorizontalPoint | null,
  config: TrailWindowConfig,
): readonly number[] {
  if (userPos === null || config.maxOrbs <= 0) return [];

  const radiusSq = config.radiusM * config.radiusM;
  const candidates: { index: number; distSq: number }[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p === null || p === undefined) continue;
    const dx = p.x - userPos.x;
    const dz = p.z - userPos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq <= radiusSq) candidates.push({ index: i, distSq });
  }

  // Nearest first, then cap, then restore index order for a stable result. Ties
  // break on index so the choice is deterministic on a doubled-back route.
  candidates.sort((a, b) => a.distSq - b.distSq || a.index - b.index);
  return candidates
    .slice(0, config.maxOrbs)
    .map((c) => c.index)
    .sort((a, b) => a - b);
}

/**
 * Assign selected breadcrumb indices to orb pool slots, minimising re-points.
 *
 * `prev[slot]` is the breadcrumb index that slot currently shows (`null` = free).
 * A slot whose index is still selected keeps it; the rest are filled with the
 * newly selected indices in order. The result always has exactly `poolSize`
 * entries, so the caller can hide the `null` slots.
 */
export function assignOrbSlots(
  prev: readonly (number | null)[],
  selected: readonly number[],
  poolSize: number,
): readonly (number | null)[] {
  const wanted = new Set(selected);
  const next: (number | null)[] = new Array<number | null>(poolSize).fill(null);

  const kept = new Set<number>();
  for (let slot = 0; slot < poolSize; slot++) {
    const current = prev[slot] ?? null;
    if (current !== null && wanted.has(current) && !kept.has(current)) {
      next[slot] = current;
      kept.add(current);
    }
  }

  const incoming = selected.filter((index) => !kept.has(index));
  let cursor = 0;
  for (let slot = 0; slot < poolSize && cursor < incoming.length; slot++) {
    if (next[slot] === null) next[slot] = incoming[cursor++]!;
  }

  return next;
}
