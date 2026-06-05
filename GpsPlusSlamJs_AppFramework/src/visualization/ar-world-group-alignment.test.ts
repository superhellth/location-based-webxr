/**
 * Tests for `enableArWorldGroupAlignment` — the framework default that wires
 * the store's alignment selector to a lerped `arWorldGroup.matrix`.
 *
 * Why this test matters: this is the load-bearing fix for the GPS-anchor
 * frame-architecture bug
 * (gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-05-gps-anchor-frame-architecture-bug-and-plan.md
 * Slice 2 / Bug A). The two simpler apps (MinimalExample, AnchorStarter) never
 * applied alignment to `arWorldGroup`, leaving the camera pure-VIO and forcing
 * every GPS anchor to absorb the full alignment delta on each re-registration.
 * This helper makes "apply lerped alignment to `arWorldGroup`" a single,
 * impossible-to-forget framework call. The tests pin:
 * - an already-present alignment is adopted at enable time (apps that enable
 *   after the first fix still register the view),
 * - a newly-dispatched alignment updates the lerper target and converges,
 * - the first target is applied instantly (no slide from identity), later
 *   targets ease,
 * - `null` alignment is ignored (no spurious identity target),
 * - `dispose()` stops both the subscription and the per-frame update.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { enableArWorldGroupAlignment } from './ar-world-group-alignment.js';
import { runFrameUpdates, clearFrameUpdates } from '../ar/frame-loop.js';
import { makeNonTrivialAlignment } from '../test-utils/non-trivial-alignment.js';
import type { SubscribableStore } from '../state/subscribe-to-selector.js';
import type { CombinedRootState } from '../state/combined-root-state.js';

/**
 * Minimal fake store exposing only the `gpsData.gpsEvents.alignmentMatrix`
 * slice that `selectAlignmentMatrix` reads. `setAlignment` replaces the
 * `gpsData` reference so the memoized selector recomputes (mirrors how the
 * real reducer produces a fresh slice on each alignment update).
 */
function makeFakeStore(initial: readonly number[] | null): SubscribableStore & {
  setAlignment: (matrix: readonly number[] | null) => void;
} {
  const listeners = new Set<() => void>();
  let state = {
    gpsData: { gpsEvents: { alignmentMatrix: initial } },
  } as unknown as CombinedRootState;
  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAlignment: (matrix: readonly number[] | null) => {
      state = {
        gpsData: { gpsEvents: { alignmentMatrix: matrix } },
      } as unknown as CombinedRootState;
      for (const listener of [...listeners]) listener();
    },
  };
}

function matrixIsIdentity(group: THREE.Object3D): boolean {
  return group.matrix.equals(new THREE.Matrix4());
}

/**
 * The lerper decomposes each target into position/quaternion/scale and
 * recomposes it, so even an instantly-applied first target is not bit-identical
 * to the source array. Compare element-wise with a tight tolerance instead.
 */
function expectMatrixClose(
  actual: readonly number[],
  expected: readonly number[]
): void {
  for (let i = 0; i < 16; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 6);
  }
}

afterEach(() => {
  clearFrameUpdates();
});

describe('enableArWorldGroupAlignment', () => {
  it('adopts an alignment already present in the store at enable time', () => {
    const m = makeNonTrivialAlignment(1);
    const store = makeFakeStore(m);
    const arWorldGroup = new THREE.Group();

    const handle = enableArWorldGroupAlignment({ store, arWorldGroup });
    // The first target is applied instantly on the first frame.
    runFrameUpdates(1, 1);

    expect(matrixIsIdentity(arWorldGroup)).toBe(false);
    expectMatrixClose(
      arWorldGroup.matrix.toArray(),
      new THREE.Matrix4().fromArray([...m]).toArray()
    );
    handle.dispose();
  });

  it('leaves arWorldGroup at identity while the store alignment is null', () => {
    const store = makeFakeStore(null);
    const arWorldGroup = new THREE.Group();

    const handle = enableArWorldGroupAlignment({ store, arWorldGroup });
    runFrameUpdates(1, 1);

    expect(matrixIsIdentity(arWorldGroup)).toBe(true);
    handle.dispose();
  });

  it('applies the first dispatched alignment instantly, then eases to later ones', () => {
    const store = makeFakeStore(null);
    const arWorldGroup = new THREE.Group();
    const handle = enableArWorldGroupAlignment({ store, arWorldGroup });

    const m1 = makeNonTrivialAlignment(2);
    store.setAlignment(m1);
    runFrameUpdates(1, 1);
    // First target → instant (within decompose/compose float tolerance).
    expectMatrixClose(
      arWorldGroup.matrix.toArray(),
      new THREE.Matrix4().fromArray([...m1]).toArray()
    );

    const m2 = makeNonTrivialAlignment(3);
    store.setAlignment(m2);
    // A single tiny step must NOT have reached m2 yet (it eases).
    runFrameUpdates(1 / 60, 2);
    const partial = arWorldGroup.matrix.toArray();
    const target = new THREE.Matrix4().fromArray([...m2]).toArray();
    expect(partial).not.toEqual(target);

    // Many steps converge close to m2.
    for (let i = 0; i < 600; i++) runFrameUpdates(1 / 60, 3 + i / 60);
    const converged = new THREE.Vector3().setFromMatrixPosition(
      arWorldGroup.matrix
    );
    const want = new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().fromArray([...m2])
    );
    expect(converged.distanceTo(want)).toBeLessThan(1e-3);
    handle.dispose();
  });

  it('stops updating arWorldGroup after dispose()', () => {
    const m1 = makeNonTrivialAlignment(4);
    const store = makeFakeStore(m1);
    const arWorldGroup = new THREE.Group();
    const handle = enableArWorldGroupAlignment({ store, arWorldGroup });
    runFrameUpdates(1, 1);
    const afterFirst = arWorldGroup.matrix.toArray();

    handle.dispose();
    // A post-dispose dispatch + frames must not move the group.
    store.setAlignment(makeNonTrivialAlignment(5));
    runFrameUpdates(1, 2);
    runFrameUpdates(1, 3);
    expect(arWorldGroup.matrix.toArray()).toEqual(afterFirst);
  });
});
