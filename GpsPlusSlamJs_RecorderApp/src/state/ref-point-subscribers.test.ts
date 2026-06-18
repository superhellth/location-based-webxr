/**
 * Tests for wireRefPointSubscribers.
 *
 * Step 5.3 of 2026-05-27-collapse-refpoint-and-frame-slices-plan.md
 * migrated this subscriber from the library's `selectReferencePoints`
 * onto the recorder-side flat `selectRefPointEntries` selector
 * (`state.refPoints.entries`). The wirer must call
 * `visualizer.syncRefPoints` once on attach (initial sync) and exactly
 * once per change of the selector's memoised result, and must not fire
 * when the selector returns the same reference twice in a row.
 */

import { describe, it, expect, vi } from 'vitest';
import { wireRefPointSubscribers } from './ref-point-subscribers';
import type { RecorderStore } from './recorder-store';
import type { RefPointEntry } from './ref-points-slice';
import type { LatLong } from 'gps-plus-slam-app-framework/state';

interface MockState {
  // Only the shape the selectors read from: `selectRefPointEntries` reads
  // `refPoints.entries`, `selectZeroReference` reads `gpsData.zero`.
  refPoints: { entries: readonly RefPointEntry[] };
  gpsData?: { zero: LatLong | null } | null;
}

function makeEntry(id: string, timestamp = 0): RefPointEntry {
  return {
    id,
    timestamp,
    rawGpsPoint: {
      id: `gps-${id}`,
      latitude: 50,
      longitude: 8,
      altitude: 245,
      timestamp,
    },
  };
}

function makeMockStore(initial: MockState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state as unknown as ReturnType<RecorderStore['getState']>,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const setState = (next: MockState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  return { store: store as unknown as RecorderStore, setState };
}

function makeVisualizer() {
  return {
    syncRefPoints: vi.fn(),
    setZeroRef: vi.fn(),
  };
}

describe('wireRefPointSubscribers', () => {
  it('performs an initial sync on attach', () => {
    const v = makeVisualizer();
    const a = makeEntry('a', 1);
    const { store } = makeMockStore({
      refPoints: { entries: [a] },
    });

    wireRefPointSubscribers(store, v);

    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);
    expect(v.syncRefPoints).toHaveBeenLastCalledWith([a]);
  });

  it('syncs again when the selector result reference changes', () => {
    const v = makeVisualizer();
    const { store, setState } = makeMockStore({
      refPoints: { entries: [] },
    });
    wireRefPointSubscribers(store, v);
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);

    const a = makeEntry('a', 1);
    setState({ refPoints: { entries: [a] } });
    expect(v.syncRefPoints).toHaveBeenCalledTimes(2);
    expect(v.syncRefPoints).toHaveBeenLastCalledWith([a]);

    const b = makeEntry('b', 2);
    setState({ refPoints: { entries: [a, b] } });
    expect(v.syncRefPoints).toHaveBeenCalledTimes(3);
    expect(v.syncRefPoints).toHaveBeenLastCalledWith([a, b]);
  });

  it('does not sync when the selector returns the same reference', () => {
    const v = makeVisualizer();
    const refPoints = { entries: [makeEntry('a', 1)] };
    const { store, setState } = makeMockStore({ refPoints });
    wireRefPointSubscribers(store, v);
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);

    // Top-level state object changes but `refPoints` reference is
    // reused → `selectRefPointEntries` (a `createSelector`) returns the
    // same memoised array, so the wirer must not re-dispatch.
    setState({ refPoints });
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);

    setState({ refPoints });
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);
  });

  // --- Zero-reference reactivity (state-outside-store audit F2) ---
  //
  // The store is the single source of truth for the GPS zero reference.
  // `RefPointVisualizer` caches it (and uses it for lat/lon → metres
  // conversion), so a stale cache would offset every ref-point marker.
  // The previous wiring set the visualizer's zero exactly once and ignored
  // later store changes; these tests pin the requirement that a *changed*
  // store zero is pushed through so points re-render at the new origin.

  it('pushes the store zero reference to the visualizer on attach', () => {
    const v = makeVisualizer();
    const { store } = makeMockStore({
      refPoints: { entries: [] },
      gpsData: { zero: { lat: 50, lon: 8 } },
    });

    wireRefPointSubscribers(store, v);

    expect(v.setZeroRef).toHaveBeenCalledTimes(1);
    expect(v.setZeroRef).toHaveBeenLastCalledWith({ lat: 50, lon: 8 });
  });

  it('does not push a zero reference on attach when the store has none', () => {
    const v = makeVisualizer();
    const { store } = makeMockStore({
      refPoints: { entries: [] },
      gpsData: { zero: null },
    });

    wireRefPointSubscribers(store, v);

    expect(v.setZeroRef).not.toHaveBeenCalled();
  });

  it('re-pushes setZeroRef when the store zero reference CHANGES (re-zero)', () => {
    const v = makeVisualizer();
    const { store, setState } = makeMockStore({
      refPoints: { entries: [] },
      gpsData: { zero: { lat: 50, lon: 8 } },
    });
    wireRefPointSubscribers(store, v);
    expect(v.setZeroRef).toHaveBeenCalledTimes(1);

    // A new origin (re-zero / QR-origin override). The wirer must forward it so
    // the visualizer re-renders cached points at the new origin instead of
    // staying pinned to the stale one.
    setState({
      refPoints: { entries: [] },
      gpsData: { zero: { lat: 51, lon: 9 } },
    });
    expect(v.setZeroRef).toHaveBeenCalledTimes(2);
    expect(v.setZeroRef).toHaveBeenLastCalledWith({ lat: 51, lon: 9 });
  });

  it('does not re-push setZeroRef when the zero reference is unchanged', () => {
    const v = makeVisualizer();
    const zero = { lat: 50, lon: 8 };
    const { store, setState } = makeMockStore({
      refPoints: { entries: [] },
      gpsData: { zero },
    });
    wireRefPointSubscribers(store, v);
    expect(v.setZeroRef).toHaveBeenCalledTimes(1);

    // Unrelated change (new ref point) but the same `gpsData` reference, so the
    // memoised zero selector returns the same value → no redundant re-push.
    setState({
      refPoints: { entries: [makeEntry('a', 1)] },
      gpsData: { zero },
    });
    expect(v.setZeroRef).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when visualizer is null', () => {
    const { store, setState } = makeMockStore({
      refPoints: { entries: [] },
    });
    const unsubscribe = wireRefPointSubscribers(store, null);
    expect(typeof unsubscribe).toBe('function');
    expect(() => {
      setState({
        refPoints: { entries: [makeEntry('x', 1)] },
      });
    }).not.toThrow();
    unsubscribe();
  });

  it('returned unsubscribe detaches the store listener', () => {
    const v = makeVisualizer();
    const { store, setState } = makeMockStore({
      refPoints: { entries: [] },
    });
    const unsubscribe = wireRefPointSubscribers(store, v);
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);
    unsubscribe();

    setState({
      refPoints: { entries: [makeEntry('p', 1)] },
    });
    expect(v.syncRefPoints).toHaveBeenCalledTimes(1);
  });
});
