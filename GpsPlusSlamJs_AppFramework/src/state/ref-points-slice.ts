/**
 * Redux slice for reference point state that was previously stored
 * in closure variables inside ref-point-handlers.ts.
 *
 * Moving this state into Redux enables:
 * - Store subscribers to react to imported ref-point changes (e.g., 2D map overlay)
 * - DevTools inspection and time-travel debugging
 * - Clean dependency boundaries for framework extraction
 *
 * @see docs/2026-03-26-state-management-audit.md §3.1 / §8.3.1
 * @see docs/2026-03-27-library-extraction-plan.md §4.1 Priority 1
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSelector, createSlice } from '@reduxjs/toolkit';
import type { ImportedRefPoint } from '../storage/ref-point-importer';
import { gpsToH3, type KnownRefPoint } from '../ref-points/h3-ref-point';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface RefPointsState {
  /** Prior ref points loaded from previous session ZIPs. */
  importedRefPoints: ImportedRefPoint[];
  /**
   * Tracks how many times each ref point was marked in the current session.
   * Keyed by ref-point ID (H3 index). Plain object for Redux serializability
   * (replaces the Map<string, number> that lived in the closure).
   */
  sessionRefPointUsage: Record<string, number>;
}

const initialState: RefPointsState = {
  importedRefPoints: [],
  sessionRefPointUsage: {},
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const refPointsSlice = createSlice({
  name: 'refPoints',
  initialState,
  reducers: {
    setImportedRefPoints(state, action: PayloadAction<ImportedRefPoint[]>) {
      state.importedRefPoints = action.payload;
    },
    incrementRefPointUsage(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.sessionRefPointUsage[id] =
        (state.sessionRefPointUsage[id] ?? 0) + 1;
    },
    clearSessionRefPointUsage(state) {
      state.sessionRefPointUsage = {};
    },
    resetRefPointsState() {
      return initialState;
    },
  },
});

export const {
  setImportedRefPoints,
  incrementRefPointUsage,
  clearSessionRefPointUsage,
  resetRefPointsState,
} = refPointsSlice.actions;

export const refPointsReducer = refPointsSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Memoized selector that derives KnownRefPoint[] (with H3 indices) from
 * importedRefPoints. Replaces the closure-based `recomputeKnownRefPoints()`
 * in ref-point-handlers.ts.
 *
 * Uses createSelector (reselect) for standard RTK memoization — recomputes
 * only when the importedRefPoints array reference changes.
 */
export const selectCachedKnownRefPoints = createSelector(
  (state: RefPointsState) => state.importedRefPoints,
  (importedRefPoints): KnownRefPoint[] =>
    importedRefPoints.map((rp) => ({
      h3Index: gpsToH3(rp.lat, rp.lon),
      displayName: rp.name || rp.id,
      lat: rp.lat,
      lon: rp.lon,
    }))
);
