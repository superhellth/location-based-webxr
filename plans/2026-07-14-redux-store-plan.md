# 2026-07-14 — Component 3: Tour Data Model + Redux Store (implementation plan)

## Context

Components 1 (billboard) and 2 (in-world-text) are warm-up pieces with no Redux.
Component 3 is the **contract layer** — the shared `tour.json` schema, the
`validateTour` loader, the Redux slices, store factories, and selectors that
every subsequent component (4–10) codes against.

The architecture is **already agreed** in `plans/Shared-Contract.md`. That file is
the single source of truth. **This plan implements it — it does not get to rename
the actions/selectors it defines.** Where this plan adds surface beyond the
contract, the addition is called out explicitly and **back-ported into
`Shared-Contract.md` in the same commit** so the contract stays the one source
(CLAUDE.md: "Agree the shared contract first").

Package: **`GpsPlusSlamJs_TourBuilder/`** (same package as components 1–2). Store
code lives at package root in `store/`; the demo lives under `components/store/`.

**On implementation start:** add a "Selector contract" section to
`plans/Shared-Contract.md` (§2.3) stating: *all components that read store state
must use selectors from `store/selectors.ts`; a component needing a new read adds
its selector there rather than selecting inline.*

---

## ⚠️ Revision note — divergences from the previous draft

The first draft of this plan (the one being revised) silently renamed the agreed
contract surface and dropped a required artifact. The corrections below are the
substance of this revision:

1. **Action names conform to `Shared-Contract.md` §2.3**, not the draft's
   invented names. `setTour`→**`loadTour`**; `setZoneState`→**`setWaypointZone`**;
   authoring `setAuthoringName/Description`→**`setTourMeta`**;
   `appendBreadcrumb`→**`addBreadcrumbPoint`**. See the reconciliation table.
2. **`validateTour` + a sample `tour.json` fixture are in-scope.** The contract
   (§6 step 2) explicitly assigns them to Component 3. The draft omitted them.
3. **`selectExportedTour` (draft→Tour bridge, contract D12/§2.3) is in-scope.**
   The draft omitted it; it is what packaging (component 5) exports.
4. **Factory `storageBackend` correctness.** `createSlamAppStore` **requires**
   `storageBackend` (no default) and runs `validateLicenseKey` — the draft's
   `createViewingStore(options?)` spreading `...options` throws the "constructs
   without throwing" smoke test. Both factories must default to
   `new NullStorageBackend()`.
5. **The "reload → state persists" verification is wrong** and removed. See
   Verification note — `persistedExtraPrefixes` feeds the *recording/replay*
   stream (contract D12), it does **not** rehydrate Redux on browser reload.
6. **Tooling: `store/` at package root sits outside every existing check glob.**
   `format`, `jscpd`, `depcruise`, and the tsconfig `include` all scan
   `components` only. Each must be extended to cover `store`.

---

## Decisions (resolved — from the draft, corrected)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Where does store code live? | `store/` at package root (not under `components/`) |
| 2 | Scope | Types + **`validateTour` + fixture** + slices + typed action creators + two store factories + selectors |
| 3 | Demo page | Interactive control panel — buttons for every action, live JSON state output |
| 4 | Types location | Defined in `store/types.ts`, imported by all other components |
| 5 | Internal structure | Flat — no `slices/` subfolder |
| 6 | `zones` actions | `initZones(waypointIds[])` (additive) + `setWaypointZone({ id, zone })` (contract). Transition logic stays in Component 4. |
| 7 | `authoring` persistence | `createAuthoringStore()` passes `persistedExtraPrefixes: [slicePrefixOf(<any authoring action>.type)]` — one slice prefix covers all `authoring/*` |
| 8 | `tour` actions | `loadTour(tour: Tour)` (contract) + `clearTour()` (additive). No validation in the reducer — the loader calls `validateTour` first. |
| 9 | Selectors | Contract §2.3 set in `store/selectors.ts`; future components extend it there |

---

## Action / selector reconciliation (contract is authoritative)

| Draft name | Contract §2.3 name | Resolution |
|---|---|---|
| `setTour(tour)` | `loadTour(tour)` | use **`loadTour`** |
| — | — | `clearTour()` — **additive**, back-port to contract |
| `markWaypointVisited(id)` | `markWaypointVisited(id)` | ✅ matches |
| `initZones(ids[])` | — | **additive** (component-4 bootstrap), back-port |
| `setZoneState({waypointId,state})` | `setWaypointZone({id,zone})` | use **`setWaypointZone`** |
| `setAuthoringName` / `setAuthoringDescription` | `setTourMeta({name,description})` | use **`setTourMeta`** |
| `addWaypoint` | `addWaypoint({id,position})` | ✅ (contract payload shape) |
| `updateWaypoint` / `removeWaypoint` | — | **additive** (component-10 editing), back-port |
| `addAsset` / `removeAsset` | `attachAsset({waypointId,slot,asset})` | contract's `attachAsset` registers the `AssetEntry` **and** sets the waypoint slot in one action (D4). Keep `attachAsset`; add `removeAsset(id)` as **additive** |
| `appendBreadcrumb` | `addBreadcrumbPoint(point)` | use **`addBreadcrumbPoint`** |
| `clearAuthoring` | — | **additive**, back-port |

Selectors — use the **contract §2.3 names**, keep the draft's extras as additive:

```ts
// contract §2.3 (authoritative)
selectTour(state): Tour | null
selectOrderedWaypoints(state): readonly Waypoint[]
selectNextUnvisitedWaypoint(state): Waypoint | null
selectTourProgress(state): { visited: number; total: number }
selectWaypointZone(state, id): ZoneState
selectActiveWaypointIds(state): readonly string[]
selectWaypointVisual(wp: Waypoint): { kind: 'model' | 'sprite'; assetId: AssetId } | null // takes a Waypoint, not state
selectExportedTour(state): Tour   // authoring draft → canonical Tour (D12) — packaging entry point

// additive conveniences (back-port to §2.3 when added)
selectAssets(state): readonly AssetEntry[]
selectWaypointById(state, id): Waypoint | undefined
selectVisitedWaypointIds(state): readonly string[]
selectAuthoringWaypoints(state): readonly Waypoint[]
```

---

## File layout

```
store/
  types.ts             # Tour, Waypoint, AssetEntry, TourCoord, AssetId, AssetType, ZoneState, AssetProvider
  validate-tour.ts     # validateTour(raw): Tour — enforces the 6 invariants; rejects malformed (contract §1)
  fixtures/
    sample-tour.ts     # one tour, three waypoints, two assets — shared by tests + demo
    sample-tour.json   # hand-written on-disk sample (the fixture's serialized form)
  tour-slice.ts             # { tour: Tour | null }, loadTour, clearTour
  tour-progress-slice.ts    # { visitedWaypointIds }, markWaypointVisited; resets on clearTour
  zones-slice.ts            # { byWaypointId }, initZones, setWaypointZone; resets on clearTour
  authoring-slice.ts        # { name, description, assets, waypoints, breadcrumb }, actions per table above
  selectors.ts              # contract §2.3 selectors + additive conveniences
  viewing-store.ts          # createViewingStore()  — extraReducers: tour, tourProgress, zones
  authoring-store.ts        # createAuthoringStore() — extraReducers: authoring + persistedExtraPrefixes
  store.test.ts             # slices + selectors + validateTour + factory smoke tests
  README.md                 # sidecar: Purpose / Public API / Invariants / Examples / Tests

components/store/
  index.html
  demo.ts                   # control panel; reuses store/fixtures/sample-tour.ts
```

Every behavior file gets its colocated `*.md` sidecar (mandatory convention) —
at minimum `validate-tour.ts.md`, `tour-slice.ts.md`, `zones-slice.ts.md`,
`authoring-slice.ts.md`, `selectors.ts.md`, plus the `store/README.md`.

---

## `types.ts` content

Copy the interfaces **verbatim from `Shared-Contract.md` §1** (do not re-derive —
they must stay structurally identical so a `TourCoord` drops into
`createGpsAnchor` with zero field mapping, D5). Add `AssetProvider` (§3).

```ts
export type AssetId = string;
export type AssetType = 'sprite' | 'model' | 'audio';
export type ZoneState = 'IDLE' | 'PREFETCHING' | 'ACTIVE';

export interface TourCoord { readonly lat: number; readonly lon: number; readonly altitude?: number; }
export interface AssetEntry { readonly id: AssetId; readonly type: AssetType; readonly filename: string; }
export interface WaypointContent { readonly model?: AssetId; readonly sprite?: AssetId; readonly audio?: AssetId; readonly transcript?: string; }
export interface Waypoint { readonly id: string; readonly position: TourCoord; readonly prefetchRadius: number; readonly activeRadius: number; readonly content: WaypointContent; }
export interface Tour { readonly id: string; readonly name: string; readonly description: string; readonly assets: readonly AssetEntry[]; readonly waypoints: readonly Waypoint[]; readonly breadcrumb: readonly TourCoord[]; }

export interface AssetProvider {
  getAssetUrl(id: AssetId): Promise<string>;
  release(id: AssetId): void;
}
```

---

## `validate-tour.ts` (new — was missing)

`validateTour(raw: unknown): Tour` — the load-time gate (contract §1 invariants).
Pure, framework-free, THREE-free. Throws (rejects) on any violation; never
returns partial data (invariant 6).

Enforces:
1. Every `AssetId` in a waypoint (`model`/`sprite`/`audio`) exists in `assets`.
2. At most one of `content.model` / `content.sprite` per waypoint.
3. `id`s unique within `assets` and within `waypoints`.
4. Per waypoint `prefetchRadius > activeRadius > 0`.
5. Shape/type checks on every field (it takes `unknown`).

Not checked here (owned elsewhere, per contract): `AssetEntry.filename` presence
in the zip is packaging's job (component 5). No `schemaVersion` (D9).

Tests: valid fixture passes and round-trips; one focused failing case **per
invariant**.

---

## Slice specs

### `tour-slice.ts`
- State `{ tour: Tour | null }` (initial `null`)
- `loadTour(tour: Tour)` — sets it (immutable thereafter). Caller must have run
  `validateTour` first; the reducer does not validate.
- `clearTour()` — back to `null`.

### `tour-progress-slice.ts`
- State `{ visitedWaypointIds: readonly string[] }` (initial `[]`)
- `markWaypointVisited(id)` — idempotent (no-op if present)
- `extraReducers`: `clearTour` → `[]`

### `zones-slice.ts`
- State `{ byWaypointId: Record<string, ZoneState> }` (initial `{}`)
- `initZones(waypointIds: string[])` — all → `'IDLE'`
- `setWaypointZone({ id, zone })` — updates one entry, leaves others untouched
- `extraReducers`: `clearTour` → `{}`

### `authoring-slice.ts`
- State mirrors `Tour` draft fields: `{ name, description, assets, waypoints, breadcrumb }`
- Actions (final names): `setTourMeta`, `addWaypoint`, `updateWaypoint`,
  `removeWaypoint`, `attachAsset`, `removeAsset`, `addBreadcrumbPoint`,
  `clearAuthoring`.
- `attachAsset({ waypointId, slot, asset })` writes the `AssetEntry` into `assets`
  (dedup by id) **and** sets the waypoint's `content[slot]` (D4 at-most-one
  invariant for model/sprite enforced here at author time).

---

## `selectors.ts`

Contract §2.3 set + additive conveniences (see reconciliation table). Selectors
are typed against the concrete combined-state types (below), not `any`.
`selectWaypointVisual` takes a `Waypoint`, not `state`. `selectExportedTour`
assembles the authoring draft into a canonical `Tour` (generates the tour `id` if
the draft has none) and is packaging's single read point.

---

## Store factories

Mirror the recorder's `createRecorderStore` pattern
(`GpsPlusSlamJs_RecorderApp/src/state/recorder-store.ts`): default the storage
backend, narrow the returned `getState` to a concrete combined-state type.

```ts
import { createSlamAppStore, type SlamAppRootState } from 'gps-plus-slam-app-framework/state/create-slam-app-store';
import { NullStorageBackend } from 'gps-plus-slam-app-framework/storage/null-storage-backend'; // verify exact subpath
import { slicePrefixOf } from 'gps-plus-slam-app-framework/state';

export interface ViewingRootState extends SlamAppRootState {
  tour: TourSliceState; tourProgress: TourProgressSliceState; zones: ZonesSliceState;
}
export interface AuthoringRootState extends SlamAppRootState { authoring: AuthoringSliceState; }

export function createViewingStore(options: { storageBackend?: StorageBackend } = {}) {
  return createSlamAppStore({
    storageBackend: options.storageBackend ?? new NullStorageBackend(),
    extraReducers: { tour: tourReducer, tourProgress: tourProgressReducer, zones: zonesReducer },
  });
}

export function createAuthoringStore(options: { storageBackend?: StorageBackend } = {}) {
  return createSlamAppStore({
    storageBackend: options.storageBackend ?? new NullStorageBackend(),
    extraReducers: { authoring: authoringReducer },
    // ONE prefix covers every authoring/* action — derived from an action type,
    // never a literal (recorder pattern: a rename can't silently drop it).
    persistedExtraPrefixes: [slicePrefixOf(setTourMeta.type)],
  });
}
```

Note: `createSlamAppStore` also runs `validateLicenseKey` with the bundled
community key by default — no extra wiring needed, but it means the factory does
real work, so smoke tests must actually call it (not just import).

---

## Tests (`store/store.test.ts`)

Mirror the slice-test style in
`components/billboard/core/playback-transport.test.ts`.

- **Each slice:** initial state; each action; idempotency/edge cases.
- **zones:** `initZones` sets all IDLE; `setWaypointZone` updates one without
  touching others; cross-slice `clearTour` resets to `{}`.
- **tourProgress:** `markWaypointVisited` idempotent; cross-slice reset.
- **authoring:** `attachAsset` registers the entry and sets the slot; model/sprite
  at-most-one enforced; `removeWaypoint` drops it; `clearAuthoring` resets.
- **validateTour:** valid fixture passes; one failing test per invariant 1–5.
- **selectors:** each contract selector against a fixture store state
  (`selectNextUnvisitedWaypoint` before/after visits; `selectWaypointVisual` for
  model / sprite / empty; `selectExportedTour` round-trips draft→Tour and the
  result passes `validateTour`).
- **factory smoke tests:** `createViewingStore()` and `createAuthoringStore()`
  construct (call, not just import) without throwing; `getState()` returns the
  expected slice keys (`tour`/`tourProgress`/`zones` and `authoring` respectively,
  plus the framework base keys).

---

## Demo page (`components/store/`)

Plain HTML + TS control panel, no Three.js:
- Two `<pre>` panels: viewing state (left), authoring state (right).
- Button group per slice: load sample tour / clear tour / mark waypoint visited /
  init + set zone states / edit authoring fields.
- **Sample tour comes from `store/fixtures/sample-tour.ts`** (not re-inlined) so
  the demo and tests exercise the same fixture.
- State shown as formatted JSON, re-rendered on every dispatch via `subscribe()`.
- Pick the backend explicitly: the demo uses `NullStorageBackend`. It demonstrates
  **state + action flow**, not reload-durability (see Verification).

---

## Tooling changes

- **`vite.config.ts`**: add `store: resolve(__dirname, "components/store/index.html")` to `input`.
- **root `index.html`**: add a gallery card linking to `/components/store/`.
- **`config/.dependency-cruiser.cjs`**: rule permitting `components/**` → `store/**`,
  forbidding the reverse. **Also add `store` to the `depcruise` scan target**
  (package.json `check:boundaries` scans `components` only).
- **package.json globs** (store/ is at root, outside current scans):
  - `format`: add `"store"` to the prettier path list.
  - `check:dup` (`jscpd`): add `store` to its target.
  - `tsconfig.app.json` / `tsconfig.vitest.json` `include`: ensure `store/**`
    is compiled (currently components-scoped). Verify before writing code —
    a missing include means `typecheck` silently skips the new files.

---

## Verification

1. `pnpm run test:unit` — all slice + selector + `validateTour` tests pass.
2. `pnpm run typecheck` — no errors (confirm `store/**` is actually in the tsconfig
   include first, or this passes vacuously).
3. `pnpm run dev` → open `/components/store/`, click every button, confirm both
   panels update correctly.
4. **Persistence (corrected):** do **not** expect browser-reload to restore state
   — `createSlamAppStore` has no rehydration path; `persistedExtraPrefixes` only
   whitelists `authoring/*` actions into the **recording/replay** stream (contract
   D12: "replayable authoring walks", mirroring recorder `refPoints`). Verify this
   the way the recorder does: with an OPFS/recording backend, dispatch authoring
   actions, export/replay, and assert the actions round-trip. If a
   reload-survival demo is wanted, that's a separate localStorage rehydration
   feature not in this component's scope — flag it, don't fake it.
5. `pnpm run test:core` — full gate (format, lint, jscpd, cycles, boundaries,
   deadcode, typecheck) passes, including the newly-scoped `store/`.

---

## Deliverable ordering (contract §6 step 2)

1. `types.ts` + `validate-tour.ts` + `fixtures/sample-tour.{ts,json}` + their tests
   — the first committed artifact, so downstream components have the types to code
   against immediately.
2. Slices + selectors + tests.
3. Store factories + smoke tests.
4. Demo page + tooling wiring.
5. Back-port the additive actions/selectors into `Shared-Contract.md` §2.3 and add
   the "Selector contract" note — same commit as the code that introduces them.
