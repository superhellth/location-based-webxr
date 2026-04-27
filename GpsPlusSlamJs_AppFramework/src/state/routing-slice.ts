/**
 * Routing Slice — Redux state for current application screen.
 *
 * Bug 2 fix (SPA architecture audit): Moves `currentScreen` from a
 * module-level variable in navigation.ts into Redux, making it the
 * single source of truth for screen state. This enables time-travel
 * debugging and prevents desync between navigation state and Redux.
 *
 * @see docs/2026-04-06-spa-architecture-audit.md — Bug 2
 * @see docs_guides/spa-architecture-best-practices.md — §4 State-Driven Routing
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

/** Application screen states for history-based navigation. */
export type AppScreen = 'setup' | 'ar' | 'recording' | 'summary';

export interface RoutingState {
  currentScreen: AppScreen;
}

const initialState: RoutingState = {
  currentScreen: 'setup',
};

const routingSlice = createSlice({
  name: 'routing',
  initialState,
  reducers: {
    navigateTo(state, action: PayloadAction<AppScreen>) {
      state.currentScreen = action.payload;
    },
  },
});

export const { navigateTo } = routingSlice.actions;
export const routingReducer = routingSlice.reducer;
