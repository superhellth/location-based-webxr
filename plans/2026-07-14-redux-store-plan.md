# 2026-07-14 — Component 3: Tour Data Model + Redux Store

## Context

Components 1 (billboard) and 2 (in-world-text) are warm-up pieces with no Redux. Component 3 is the contract layer — the shared `tour.json` schema, Redux slices, store factories, and selectors that every subsequent component (4–10) codes against. The architecture is already agreed in `plans/Shared-Contract.md`; this plan is the implementation spec.

**On implementation start:** Update `plans/Shared-Contract.md` to add a "Selector contract" section stating: *all components that read store state must use selectors from `store/selectors.ts`; all components that need new reads must add their selectors there rather than selecting inline.*

---

## Decisions (resolved)

| # | Decision | Choice |
|---|---|---|
| 1 | Where does store code live? | `store/` at package root (not under `components/`) |
| 2 | Scope | Slices + type-safe action creators + two store factories + selectors |
| 3 | Demo page | Interactive control panel — buttons for every action, live JSON state output |
| 4 | Types location | Defined in `store/types.ts`, imported by all other components |
| 5 | Internal structure | Flat — no `slices/` subfolder |
| 6 | `zones` slice actions | `initZones(waypointIds[])` + `setZoneState(waypointId, state)` — transition logic stays in Component 4 |
| 7 | `authoring` persistence | Full wiring — `createAuthoringStore()` passes `persistedExtraPrefixes` for all `authoring/*` actions |
| 8 | `tour` slice actions | `setTour(tour: Tour)` + `clearTour()` — no validation in reducer |
| 9 | Selectors | Minimal set in `store/selectors.ts`; future components add selectors there |
| 10 | Cross-slice reset on `clearTour` | `extraReducers` in each slice — `tourProgress` and `zones` listen to `clearTour` |

---

## File layout

```
store/
  types.ts           # Tour, Waypoint, AssetEntry, TourCoord, AssetId, ZoneState, AssetProvider
  tour-slice.ts      # { tour: Tour | null }, setTour, clearTour
  tour-progress-slice.ts  # { visitedWaypointIds: readonly string[] }, markWaypointVisited
  zones-slice.ts     # { byWaypointId: Record<string, ZoneState> }, initZones, setZoneState
  authoring-slice.ts # { name, description, assets, waypoints, breadcrumb }, update actions
  selectors.ts       # All store selectors — components MUST use and extend this file
  viewing-store.ts   # createViewingStore() — extraReducers: tour, tourProgress, zones
  authoring-store.ts # createAuthoringStore() — extraReducers: authoring + persistedExtraPrefixes
  store.test.ts      # Unit tests for all slices + selectors + factory smoke tests
  README.md          # Sidecar: Purpose / Public API / Invariants / Examples / Tests

components/store/    # Demo page entry
  index.html
  demo.ts
```

Root `index.html` gallery card and `vite.config.ts` input entry added for `store` demo.

---

## types.ts content

```ts
export type AssetId = string;
export type AssetType = 'sprite' | 'model' | 'audio';
export type ZoneState = 'IDLE' | 'PREFETCHING' | 'ACTIVE';

export interface TourCoord { lat: number; lon: number; altitude?: number; }
export interface AssetEntry { id: AssetId; type: AssetType; filename: string; }
export interface WaypointContent { model?: AssetId; sprite?: AssetId; audio?: AssetId; transcript?: string; }
export interface Waypoint { id: string; position: TourCoord; prefetchRadius: number; activeRadius: number; content: WaypointContent; }
export interface Tour { id: string; name: string; description: string; assets: readonly AssetEntry[]; waypoints: readonly Waypoint[]; breadcrumb: readonly TourCoord[]; }

export interface AssetProvider {
  getAssetUrl(id: AssetId): Promise<string>;
  release(id: AssetId): void;
}
```

---

## Slice specs

### `tour-slice.ts`
- State: `{ tour: Tour | null }` (initial: `null`)
- Actions: `setTour(tour: Tour)`, `clearTour()`
- No validation in reducer — caller's responsibility

### `tour-progress-slice.ts`
- State: `{ visitedWaypointIds: readonly string[] }` (initial: `[]`)
- Actions: `markWaypointVisited(id: string)` — idempotent (no-op if already present)
- `extraReducers`: listens to `clearTour` and resets to `[]`

### `zones-slice.ts`
- State: `{ byWaypointId: Record<string, ZoneState> }` (initial: `{}`)
- Actions: `initZones(waypointIds: string[])` — sets all to `'IDLE'`, `setZoneState({ waypointId, state })` — updates one entry
- `extraReducers`: listens to `clearTour` and resets to `{}`

### `authoring-slice.ts`
- State mirrors `Tour` fields: `{ name, description, assets, waypoints, breadcrumb }`
- Actions: `setAuthoringName`, `setAuthoringDescription`, `addWaypoint`, `updateWaypoint`, `removeWaypoint`, `addAsset`, `removeAsset`, `appendBreadcrumb`, `clearAuthoring`

### `selectors.ts` (minimal seed — extend here)
```ts
selectTour(state)
selectWaypoints(state)
selectAssets(state)
selectWaypointById(state, id)
selectZoneState(state, waypointId)
selectAllZoneStates(state)
selectVisitedWaypointIds(state)
selectIsWaypointVisited(state, id)
selectAuthoringWaypoints(state)
selectAuthoringName(state)
selectAuthoringDescription(state)
```

---

## Store factories

### `viewing-store.ts`
```ts
export function createViewingStore(options?) {
  return createSlamAppStore({
    ...options,
    extraReducers: { tour: tourReducer, tourProgress: tourProgressReducer, zones: zonesReducer },
  });
}
```

### `authoring-store.ts`
```ts
export function createAuthoringStore(options?) {
  return createSlamAppStore({
    ...options,
    extraReducers: { authoring: authoringReducer },
    persistedExtraPrefixes: [slicePrefixOf(setAuthoringName.type), /* all authoring/* */],
  });
}
```

---

## Tests (`store/store.test.ts`)

Pattern: mirror the existing slice test style from `billboard/core/playback-transport.test.ts`.

- Each slice: initial state, each action, idempotency/edge cases
- `zones`: `initZones` sets all to IDLE; `setZoneState` updates one without affecting others; cross-slice `clearTour` resets zones
- `tourProgress`: `markWaypointVisited` is idempotent; cross-slice reset
- `selectors`: test each selector against a fixture store state
- Factory smoke tests: `createViewingStore()` and `createAuthoringStore()` construct without throwing; `getState()` returns the expected slice keys

---

## Demo page (`components/store/`)

Interactive control panel — no Three.js, plain HTML+TS:
- Two `<pre>` panels: viewing store state (left), authoring store state (right)
- Button groups per slice: load sample tour / clear tour / mark waypoint visited / set zone states / update authoring fields
- Sample tour fixture defined inline in `demo.ts` (one tour, three waypoints, two assets)
- State displayed as formatted JSON, updated on every dispatch via store `subscribe()`

---

## Tooling changes

- **`vite.config.ts`**: add `store: resolve(__dirname, "components/store/index.html")` to `input`
- **`root index.html`**: add gallery card linking to `/components/store/`
- **`dependency-cruiser` config**: add rule permitting `components/**` to import from `store/**`, but not the reverse

---

## Verification

1. `pnpm run test:unit` — all slice + selector tests pass
2. `pnpm run typecheck` — no errors
3. `pnpm run dev` — open `/components/store/`, click every button, confirm state updates correctly in both panels
4. Reload the authoring panel page — confirm authoring state persists (persistence middleware)
5. `pnpm run test:core` — full gate passes (lint, deadcode, cycles, boundaries)
