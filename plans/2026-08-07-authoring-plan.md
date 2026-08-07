# 2026-08-07 — Component 10: Authoring Tools (implementation plan)

## Context

Component 10 is what the author uses while physically walking the route
(TASK.md §2.3): drop a waypoint at the current GPS position with its
proximity radius, attach assets (sprite/model/audio) to it, and record the
breadcrumb trail by walking between waypoints. Per spec, this component is
**only the editing logic that emits a valid `tour.json` + asset list** — the
onboarding gate (component 9) and packaging/QR (component 5) stay separate;
wiring all three into the full Authoring mode is a Goal-2 composition step
(§2.4), not part of this component.

The store side is **already built** (component 3): `store/authoring-slice.ts`
has every reducer this component needs (`setTourMeta`, `addWaypoint`,
`updateWaypoint`, `removeWaypoint`, `attachAsset`, `removeAsset`,
`addBreadcrumbPoint`, `clearAuthoring`), `store/selectors.ts` has
`selectExportedTour` (draft → canonical `Tour`), and
`store/authoring-store.ts` already whitelists every `authoring/*` action into
the recording/replay stream via `persistedExtraPrefixes` (contract D12) — "an
authoring session can itself be recorded and replayed" is already true of any
session that only dispatches these actions; component 10 doesn't re-build
that plumbing, it just has to be a well-behaved dispatcher.

This makes component 10 genuinely thin: a live-GPS-driven orchestrator on
top of already-built pieces, plus a small amount of real new logic (id
generation, breadcrumb distance-sampling, asset-entry construction). No
Three.js, no AR scene — TASK.md's own component list only requires the AR
scene (component 8) to compose knights/orbs; dropping a waypoint or
attaching a file is a plain form interaction, same spirit as packaging's "no
AR" demo page.

Package: **`GpsPlusSlamJs_TourBuilder/`**. Layout: `components/authoring/`,
mirroring the `core`/`view` split used everywhere except `ar-scene`.

---

## Reuse — what's already built and must not be reinvented

| Need | Reused from | Why not reinvent |
|---|---|---|
| Draft state + actions | `store/authoring-slice.ts` (component 3) | Already implements every mutation comp 10 needs, with model/sprite mutual-exclusivity and dangling-reference cleanup already enforced. |
| Draft → canonical `Tour` | `store/selectors.ts` `selectExportedTour` | Already handles the id-slug generation and field mapping. |
| Schema validation | `store/validate-tour.ts` `validateTour` | The load-time gate; reused here so a draft can't export something invalid. |
| Asset filename convention | `components/packaging/core/asset-filename.ts` `assetFilename(id, file)` | Packaging (component 5) already owns the `assets/<id>.<ext>` convention and its edge cases (dotfiles, case, multiple dots) — component 10 must produce filenames packaging agrees with. |
| Asset byte access at author time | `components/cloud-loader/core/asset-provider.ts` `RefCountedAssetProvider` | Explicitly designed (its own doc comment) to back the authoring `FilesAssetProvider` (contract D14d) given a `loadAssetBlob(id)` backing — component 10 only supplies that backing function over a `Map<AssetId, File>`. |
| Live GPS fix | `gps-plus-slam-app-framework/sensors` `startGpsWatch(onPosition, onError)` | The framework's only "current position" primitive is this callback (confirmed: no Redux selector exists for "current lat/lon", only a history of past fixes) — `GpsPosition` is already `{lat, lon, altitude, ...}`, structurally a superset of `TourCoord`. |
| Geo distance between two raw fixes | `gps-plus-slam-app-framework/geo` `approxDistanceMetres(lat1,lon1,lat2,lon2)` | Already tested (backs H3 proximity matching); reusing it means no new haversine/equirectangular code is written anywhere in this component. |
| Recording/replay | `gps-plus-slam-app-framework/state` `replayRecording` | Same utility components 4/7/8 already use for their replay e2e tests. |

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AU1 | **No Three.js, no scene.** A plain DOM UI (buttons, a file input, number inputs for radii), same shape as packaging's demo. | TASK.md never asks component 10 for a 3D view; the AR scene (component 8) is the only component that composes a Three.js scene. Keeps this component testable in `jsdom` with no WebGL. |
| AU2 | **Raw lat/lon is a legitimate authoring-time exception to "no geo math outside proximity/scene logic."** The CLAUDE.md rule targets anchored, viewing-side world-space logic; at author time nothing has been anchored yet — a live GPS fix *is* the data being captured. Distance math stays confined to reusing the framework's own `approxDistanceMetres`, never new haversine/equirectangular code. | Confirmed in review: math is allowed as long as it stays inside TourBuilder and reuses existing utilities rather than reinventing. |
| AU3 | **Breadcrumb recording is continuous, always-on** — no start/stop toggle. Every live GPS fix is checked against the last *sampled* point; only a fix at least `MIN_BREADCRUMB_DISTANCE_M` away dispatches `addBreadcrumbPoint`. | Matches the spec's framing ("record the breadcrumb trail by walking between waypoints", no toggle mentioned) and the "forgiving wayfinding" philosophy — standing still naturally produces no new points, nothing to forget to press. |
| AU4 | **`MIN_BREADCRUMB_DISTANCE_M = 3`** (open/tunable, like comp 4's `HYSTERESIS_FRACTION`). | GPS is typically 1–2 m off (TASK.md §2.5.2); 3 m filters that jitter while keeping the trail's shape at walking pace. No existing precedent to mirror (confirmed: no breadcrumb/min-distance logic exists anywhere else in the repo) — this is a fresh, tunable constant. |
| AU5 | **Ids are a pure, stateless function**, not a closure-held counter: `nextId(prefix, existingIds)` derives the next number from existing ids' numeric suffixes. | No `nanoid` dependency exists anywhere in the workspace; existing precedent (component demos) is a `wp-${n}` template counter. Stateless-over-existing-ids is safer than an internal mutable counter (e.g. survives a session that already has waypoints from a replayed prefix) and is trivially pure-testable. |
| AU6 | **`PositionSource` is an injected interface**, not a hard dependency on `startGpsWatch`. `{ subscribe(onPosition): unsubscribe }`. | Lets the demo and the replay e2e test feed the exact same orchestration code a real Task-1 recording's positions instead of live GPS, without any conditional/AR-detection logic inside the orchestrator itself — same DI pattern component 4 uses for `getUserWorldPos`. |
| AU7 | **`FilesAssetProvider` is a thin wrapper over `RefCountedAssetProvider`**, owning only a `Map<AssetId, File>` backing (`loadAssetBlob` returns the `File` directly — it's already a `Blob`) and throwing `StructuralAssetError` for an unknown id. | Zero new ref-counting/retry logic; the generic provider already implements the full contract (D14a/b/c). |
| AU8 | **Replay e2e replays a real Task-1 walk**, not a novel record-round-trip. `replayRecording()` on the checked-in zip gives real noisy positions; comp 10's `PositionSource` (AU6) is fed those positions in order, a couple of `dropWaypoint()` calls happen at chosen points, and the resulting sampled breadcrumb trail + waypoint positions are asserted. | Matches the established pattern components 4/7/8 already use — proven, low-risk. The alternative (record an authoring session through a real `createAuthoringStore` + OPFS-backed recording, export, replay back) would prove the store's `persistedExtraPrefixes` plumbing itself, but no TourBuilder component does that today and the framework's own zip-round-trip test helper (`test-utils/zip-round-trip-helpers.ts`) is built around GPS/frame recordings with a fixed options shape, not arbitrary injected `authoring/*` actions — meaningfully more novel work for a guarantee component 3 already provides structurally. |
| AU9 | **Radii use the slice's own defaults** (`DEFAULT_PREFETCH_RADIUS_M`/`DEFAULT_ACTIVE_RADIUS_M`, already applied inside `addWaypoint`); the view exposes number inputs wired straight to `updateWaypoint({id, changes: {prefetchRadius, activeRadius}})` for the author to override. | No new default-picking logic — the slice already owns it (contract §4). |
| AU10 | **No throwaway prototype round**; build the final component directly (repo convention, same as component 9). | — |

---

## Architecture

### `core/id.ts` — pure id generation (AU5)

```ts
/** Next `prefix-N` not already present in `existingIds`, N starting at 1. */
export function nextId(prefix: string, existingIds: readonly string[]): string;
```

Scans `existingIds` for `${prefix}-<number>` matches, returns `prefix-(max+1)`
(or `prefix-1` if none match). Pure, no hidden counter state.

### `core/breadcrumb-sampler.ts` — pure distance-gated sampling (AU3/AU4)

```ts
export const MIN_BREADCRUMB_DISTANCE_M = 3;

/** True when `next` is far enough from the last *sampled* point to record.
 *  `last === null` (no points yet) always samples. */
export function shouldSampleBreadcrumbPoint(
  last: TourCoord | null,
  next: TourCoord,
  minDistanceM?: number,
): boolean;
```

Uses `approxDistanceMetres` from `gps-plus-slam-app-framework/geo` (AU2).

### `core/asset-attachment.ts` — pure `AssetEntry` construction

```ts
export type AssetSlot = "model" | "sprite" | "audio"; // mirrors authoring-slice's AssetSlot

/** Builds the AssetEntry to register + attach, reusing packaging's filename
 *  convention so component 5 can pack whatever component 10 produces. */
export function buildAssetEntry(id: AssetId, slot: AssetSlot, file: File): AssetEntry;
```

`slot → AssetType` is a direct mapping (`model→'model'`, `sprite→'sprite'`,
`audio→'audio'`); `filename` comes from `assetFilename(id, file)`.

### `core/export-tour.ts` — validated export

```ts
/** selectExportedTour + validateTour in one step — a draft can't export
 *  something the schema itself would reject. */
export function buildValidatedExport(state: { authoring: AuthoringSliceState }): Tour;
```

### `view/gps-position-source.ts` — injected live/replay position feed (AU6)

```ts
export interface PositionSource {
  /** Fires on every fix; returns an unsubscribe function. */
  subscribe(onPosition: (pos: TourCoord) => void): () => void;
}

/** Wraps the framework's startGpsWatch — the only real browser dependency
 *  in this component. */
export function createLiveGpsPositionSource(): PositionSource;
```

The demo/tests supply a second, trivial implementation that replays a
recorded path (calls `onPosition` once per recorded point, synchronously or
on a scrub/play control — mirrors component 4's demo).

### `view/files-asset-provider.ts` — the authoring `AssetProvider` backing (AU7)

```ts
/** Register a picked File under an asset id (called by attachAsset before
 *  dispatch, so a later getAssetUrl(id) can resolve it). */
export interface FilesAssetProviderHandle {
  readonly provider: AssetProvider;       // contract §3 interface
  registerFile(id: AssetId, file: File): void;
}

export function createFilesAssetProvider(): FilesAssetProviderHandle;
```

Internally: a `Map<AssetId, File>` + `RefCountedAssetProvider({ loadAssetBlob:
async (id) => { const f = map.get(id); if (!f) throw new StructuralAssetError(...); return f; } })`.

### `view/authoring-session.ts` — the orchestrator

```ts
export interface AuthoringSessionDeps {
  readonly positionSource: PositionSource;
  readonly dispatch: (action: AuthoringAction) => void; // authoring-slice action type
  readonly getState: () => { authoring: AuthoringSliceState };
  readonly filesAssetProvider: FilesAssetProviderHandle;
}

export interface AuthoringSession {
  /** Drop a waypoint at the latest known position. No-ops (returns null) if
   *  no fix has arrived yet. */
  dropWaypoint(): string | null; // returns the new waypoint id
  attachAsset(waypointId: string, slot: AssetSlot, file: File): void;
  /** buildValidatedExport(getState()) + the registered File map, ready for
   *  component 5's packTour(tour, assetFiles). */
  exportTour(): { tour: Tour; assetFiles: ReadonlyMap<AssetId, File> };
  destroy(): void; // unsubscribes from positionSource
}

export function createAuthoringSession(deps: AuthoringSessionDeps): AuthoringSession;
```

Subscribes to `positionSource` once at construction: tracks the latest
`TourCoord` for `dropWaypoint()`, and runs every fix through
`shouldSampleBreadcrumbPoint` against the last *dispatched* breadcrumb point,
dispatching `addBreadcrumbPoint` when it passes.

### `view/authoring-view.ts` — DOM wiring

Renders: tour name/description inputs (→ `setTourMeta`), a waypoint list
(each with prefetch/active radius inputs → `updateWaypoint`, a file input per
slot → `attachAsset` via the session, a remove button → `removeWaypoint`), a
"Drop Waypoint" button (→ `session.dropWaypoint()`), and an "Export" button
that calls `session.exportTour()`. Same reusable-mount shape as
`mountOnboardingGate` (`{ destroy() }`).

---

## Testing

### Unit — `core/`, coverage-counted

- `id.ts`: empty list → `prefix-1`; gaps/non-sequential existing ids still
  produce `max+1`; ids from a different prefix are ignored.
- `breadcrumb-sampler.ts`: first point always samples; a point under the
  threshold from the *last sampled* point (not the immediately-prior raw fix)
  does not sample; a point exactly at/over the threshold does; a cluster of
  small moves that individually stay under threshold but would sum past it
  still doesn't sample (distance is always measured from the last sampled
  point, never accumulated) — pins the "from last sampled, not last seen"
  contract explicitly.
- `asset-attachment.ts`: each slot maps to the right `AssetType`; filename
  delegates to `assetFilename` (a fixed input produces the exact same output
  as calling it directly — no drift between the two).
- `export-tour.ts`: a valid draft round-trips through `validateTour`
  untouched; an invalid draft (e.g. dangling asset reference, which
  shouldn't be reachable given the slice's own invariants, but the function
  must not silently swallow a `TourValidationError` either way) propagates
  the validator's error rather than exporting partial data.

### Unit — `view/authoring-session.ts` (mocked `PositionSource`/`dispatch`)

- `dropWaypoint()` before any fix returns `null` and dispatches nothing.
- `dropWaypoint()` after a fix dispatches `addWaypoint` with that exact
  position and a fresh id (via `nextId` seeded from current state).
- Breadcrumb dispatch only fires past `MIN_BREADCRUMB_DISTANCE_M` from the
  last *dispatched* point (integration of the pure sampler behind real
  dispatch sequencing).
- `attachAsset` registers the file in the provider **before** dispatching
  `attachAsset` (so a listener reacting to the dispatched action can already
  resolve the asset).
- `destroy()` unsubscribes — a fix delivered after `destroy()` dispatches
  nothing.

### Replay e2e — `view/authoring-session-replay.e2e.test.ts` (AU8)

`replayRecording(recordings/2026-06-22_16-06-59utc.zip)` → the real ordered
position path; feed it through a `PositionSource` test double in order;
`dropWaypoint()` at 2–3 chosen indices along the path. Assert: the dropped
waypoints land at the expected recorded positions; the sampled breadcrumb
trail only contains points ≥ `MIN_BREADCRUMB_DISTANCE_M` apart (a strict,
recording-driven proof that real GPS noise doesn't spam the trail); the
final `exportTour()` output passes `validateTour` unmodified.

---

## Demo (`components/authoring/`)

Plain DOM page (AU1), no canvas. Two position-source modes, matching
component 4/7/8's demo precedent: **Live GPS** (real device) and **Replay a
Task 1 walk** (the same `demo-walk.json`/recording used elsewhere, with
play/scrub controls) — both feed the identical `AuthoringSession`. Dropping a
waypoint shows it in a list with file inputs for model/sprite/audio and
radius number inputs; "Export" calls `session.exportTour()` and then
component 5's `packTour` + `generateQr` directly (composing already-built,
already-approved components in a demo is established precedent — `ar-scene`'s
demo already composes components 1/2/3/4/6) to produce a downloadable
`tour.zip` — satisfying the spec's demo bullet ("drop a couple of waypoints
with assets, and export — then load the result in the viewing demo").

---

## Tooling notes

- New dir `components/authoring/` — confirm inside existing
  `format`/`jscpd`/`depcruise`/tsconfig `include` globs (same check every
  prior new component dir needed) and add its `index.html` to
  `vite.config.ts`'s `rollupOptions.input` + a gallery card.
- `dependency-cruiser`: `core/` must not import `three`, DOM types, or the
  framework's browser-only sensors (`startGpsWatch` etc.) — only
  `view/gps-position-source.ts` touches those.
- `File`/`Blob`/`AudioContext`-adjacent browser globals stay in `view/` and
  `demo.ts`, never `core/`.

---

## Next steps

1. Iterate this plan with an LLM as critical reviewer; commit meaningful
   revisions.
2. Build the real component directly (TDD, red → green → refactor) — no
   throwaway prototype round (AU10).
3. `core/id.ts`, `core/breadcrumb-sampler.ts`, `core/asset-attachment.ts`,
   `core/export-tour.ts` first (pure, fastest feedback).
4. `view/gps-position-source.ts` + `view/files-asset-provider.ts`.
5. `view/authoring-session.ts` against mocked deps.
6. Replay e2e against the checked-in Task 1 recording.
7. `view/authoring-view.ts` DOM wiring.
8. `demo.ts` + `index.html`, wired to real GPS and to a replayed walk, and to
   component 5's `packTour`/`generateQr` for the export step.
9. Sidecar `README.md` per directory.
