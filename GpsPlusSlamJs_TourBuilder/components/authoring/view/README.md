# authoring/view — the browser-facing adapters, orchestrator, and DOM view

## `gps-position-source.ts`

```ts
interface PositionSource {
  subscribe(onPosition: (pos: TourCoord) => void): () => void;
}
createLiveGpsPositionSource(deps?): PositionSource
```

The only place this component touches the framework's browser-only GPS
watch directly. `startGpsWatch`/`stopGpsWatch` is the framework's only
"current position" primitive — no Redux selector exists for it, only a
history of past fixes. The demo's replay mode and every test supply their
own trivial `PositionSource` instead (plan AU6), so the orchestrator below
never knows or cares whether a fix is live or replayed.

## `files-asset-provider.ts`

```ts
interface FilesAssetProviderHandle {
  readonly provider: AssetProvider;
  registerFile(id: AssetId, file: File): void;
}
createFilesAssetProvider(overrides?): FilesAssetProviderHandle
```

The authoring-mode `AssetProvider` backing (contract D14d) — a thin wrapper
over component 6's `RefCountedAssetProvider` owning only a `Map<AssetId,
File>`. No new ref-counting/retry logic (plan AU7).

## `authoring-session.ts`

```ts
createAuthoringSession(deps: AuthoringSessionDeps): AuthoringSession
// dropWaypoint(): string | null
// attachAsset(waypointId, slot, file): void
// exportTour(): { tour: Tour; assetFiles: ReadonlyMap<AssetId, File> }
// destroy(): void
```

The orchestrator: subscribes to the injected `PositionSource` once, tracks
the latest fix for `dropWaypoint()`, and runs every fix through
`shouldSampleBreadcrumbPoint` against the last _dispatched_ breadcrumb point.
`attachAsset` registers the file with the asset-provider handle **before**
dispatching, so a listener reacting to the dispatched action can already
resolve it. `destroy()` unsubscribes and self-guards against any fix that
arrives after teardown.

## `authoring-view.ts`

```ts
mountAuthoringView(root: HTMLElement, deps: AuthoringViewDeps): { destroy(): void }
```

DOM wiring only — no logic of its own. Renders tour name/description inputs
(→ `setTourMeta`), one row per waypoint (radius inputs → `updateWaypoint`,
one file input per asset slot → `session.attachAsset`, a remove button →
`removeWaypoint`), a Drop Waypoint button (→ `session.dropWaypoint()`), and
an Export button (→ `session.exportTour()`, forwarded to the injected
`onExport`). Reacts to store changes via an injected `subscribe`/`getState`
pair rather than owning state — the `authoring` slice (component 3) is the
single source of truth. `destroy()` unsubscribes and clears the DOM.

## Tests

`gps-position-source.test.ts` and `files-asset-provider.test.ts` — mocked
framework calls / fake `createObjectUrl`. `authoring-session.test.ts` —
mocked `PositionSource`/`dispatch`. `authoring-view.test.ts`
(`@vitest-environment jsdom`) — a hand-rolled fake store, no Redux
dependency. `authoring-session-replay.e2e.test.ts` — the replay e2e (see the
root README).
