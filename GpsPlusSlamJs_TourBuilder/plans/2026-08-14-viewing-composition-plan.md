# 2026-08-14 — Goal-2 Composition, Part 2: Viewing mode (implementation plan)

## Context

Part 1 (`plans/2026-08-14-authoring-composition-plan.md`) landed `src/app/`
with the shared bootstrap (`mode.ts`, `main.ts`), the composed Authoring
flow, and a `viewing-placeholder.ts` stub. This plan replaces that stub with
the real thing — the heavier half of TASK.md §2.4:

> Viewing mode: scan QR → cloud-storage tour source range-reads the zip from
> the link (component 6) → onboarding gate → proximity state machine driving
> the AR scene + the 2D map, with breadcrumb wayfinding and the
> audio/transcript playback.

and its mandated proof:

> an end-to-end replay test that loads a real tour zip, plays one of your
> Task 1 walks through the app in viewing mode, and asserts that the right
> knights become active (appear) at the right points along the route.

Every component involved (6 cloud-loader, 3 store, 4 proximity, 8 AR scene,
7 map, 9 onboarding) is already built, tested and demoed. **The genuinely new
work is not scene logic — it is the AR runtime boundary nobody has crossed
yet.** Component 8's demo runs on a desktop with an *identity* anchor factory
(plan A23) precisely because a real `GpsAnchor` needs an alignment matrix, a
GPS zero reference, a live `arWorldGroup` and a camera that only exist inside
a WebXR session. This plan is where that substitution is paid off: enter AR,
wire the framework's GPS/alignment machinery into component 8's three
injected seams (`createAnchor`, `toWorld`, `getUserWorldPos`), and run the
scene from the framework frame loop.

Production-grade, not a prototype: the failure paths (bad link, CORS refusal,
invalid tour, no WebXR, denied permission, session ended by the system back
gesture, mid-tour reload) are designed here, not discovered outdoors.

## What this plan does NOT do

- Change any component's own `demo.ts`/`index.html`/`core`/`view`. `src/app/`
  is additive composition code only; dependencies stay `app → components` /
  `app → store` (enforced by `components-and-store-not-to-app`).
- Change Authoring mode. `mode.ts`'s branch already exists (AC2); this plan
  only swaps `mountViewingPlaceholder` for `mountViewingApp` and deletes the
  placeholder + its test.
- Wire TourBuilder into the root `build:site` / root `pnpm test` gate. Still
  reserved for a separate, later pass (it touches root scripts shared by every
  package). This plan touches TourBuilder's own `vite.config.ts`, dpdm and
  dependency-cruiser config only.
- A throwaway prototype round — established project convention.
- QR *scanning*. `GpsPlusSlamJs_QrTrackingDemo` is a separate package about
  tracking QR markers in AR; the visitor scans the printed code with the phone
  camera app, which opens `…/src/app/?tour=<zipUrl>` in the browser. Viewing
  mode's entry is the URL, not a scanner (component 5 already produces exactly
  this URL via `buildTourUrl`).

---

## Decisions

| #    | Decision | Rationale |
| ---- | -------- | --------- |
| VC1  | New `src/app/viewing/` dir; `mountViewingApp(root, tourUrl)` is the single entry, called from `main.ts`'s existing `'viewing'` branch. `viewing-placeholder.ts` + `viewing-placeholder.test.ts` are deleted in the same commit. | Mirrors `src/app/authoring/`. The placeholder existed only to keep the AC2 branch honest until now. |
| VC2  | **Screen sequence is strictly sequential: load → onboarding gate → AR-entry screen → in-session.** `openRemoteTour(tourUrl)` runs on a loading screen *before* the gate mounts; the gate mounts only once a `Tour` exists. | TASK.md §2.4 states this order (loader before gate), and component 6 is built to make it cheap — it range-reads only the central directory + `tour.json`, so the wait is "almost instant" by design (§2.5.4), not a full download. Overlapping the network with the permission prompts would save little and would require either changing component 9's `canStart` contract or faking a disabled Start outside it — a component change this plan explicitly refuses. |
| VC3  | **A separate "Enter AR" screen after onboarding**, driven by the framework's `createEnableGpsArController` (`gps-plus-slam-app-framework/ar/enable-gps-ar`). It shows the tour name/description/POI count, the 2D map (component 7) as a pre-walk overview, and one big Enter-AR button; `controller.enable({ container, isolationOptions: { enableDomOverlay: true }, callbacks, onGpsPosition, onOrientation })` runs in that click. | Two distinct gestures are needed and they are not the same gesture: onboarding's Start is the **audio-unlock** gesture (component 9's whole point, §2.5.7) and it completes with an `await`ed `AudioContext.resume()`; requesting an immersive session after those awaits risks losing transient activation. A dedicated button is also honest UX — the visitor decides when the camera comes up — and gives the tour overview + map somewhere to live before the session. The controller is the framework's own tested seam for exactly this orchestration (WebXR support probe → geolocation + orientation permissions → GPS/orientation watches → `initAR`), including teardown and external-session-end awareness; hand-rolling `initAR` here would duplicate it. |
| VC4  | The onboarding gate's `onComplete(audioContext)` is **consumed** in viewing mode. **Revised in review (R4):** the unlocked context is installed as three's *global* context — `AudioContext.setContext(unlocked)` (from `three`) — **before** `new AudioListener()`, then `camera.add(listener)`. Assigning `listener.context = unlocked` after construction is wrong and is not done. Component 8 never unlocks audio (plan A16). | This is the consumer the onboarding README names — but that README's code line (`listener.context = audioContext`) is a **latent bug**, verified against `three@0.184.0/src/audio/AudioListener.js`: the constructor does `this.context = AudioContext.getContext(); this.gain = this.context.createGain(); this.gain.connect(this.context.destination)`. Re-assigning `.context` afterwards leaves `gain` built on — and connected to — the *other*, still-locked context, so every `PositionalAudio` (component 1 builds them with `new PositionalAudio(listener)`) renders into a graph the visitor cannot hear, with no error. `AudioContext.setContext()` is three's own supported way in. Component 9's README line is corrected in a separate docs-only commit. |
| VC5  | The three component-8 seams are supplied by one new, small, unit-tested module `src/app/viewing/ar-seams.ts`: `createAnchor` = `createGpsAnchor({ object3D, arWorldGroup, camera, gpsPoint, **`skipBootstrap: true`** (R1), getAlignmentMatrix: () => selectAlignmentMatrix(store.getState()), getGpsZeroRef: () => selectZeroReference(store.getState()) })`; `getUserWorldPos` = `camera.getWorldPosition(scratch)` (returns `null` before the first pose); `toWorld(coord)` = `calcRelativeCoordsInMeters(zeroRef, coord, alt, 0)` → `nueToArLocal(alignment, nue)` → `arWorldGroup.localToWorld(...)`, `null` when either zero-ref or alignment is missing. | These are the exact framework primitives `gps-anchor.ts` itself uses for its steady-state target (`calcRelativeCoordsInMeters` + `nueToArLocal`, both public via `…/core` and `…/visualization`), so `toWorld` lands in the same frame as the anchors instead of re-deriving geo math — the §2.5.1 rule ("lat/lon only in `tour.json` and the single anchoring step") holds: this module *is* that step. `toWorld` feeds only the trail-window selection (plan A3); the orbs themselves are still anchored. **R1 (found in review, blocker):** `skipBootstrap` is not optional here. `GpsAnchorOptions.getCurrentGpsPoint` is optional and, when omitted, the anchor bootstraps from the **object's own pose** (`createObjectPoseSampler`, quality-review G-6) and commits the median as the anchor's `gpsPoint` — i.e. a tour waypoint would silently *overwrite the authored lat/lon* with wherever the mesh happened to be sitting (the AR origin). AnchorStarter bootstraps because it is *placing* a new anchor; viewing mode already knows the coordinate — the authored `tour.json` value is authoritative, so the correct mode is "skip bootstrap, snap to the computed target". |
| VC6  | `enableArWorldGroupAlignment({ store, arWorldGroup })` is called once after `initAR`. No per-anchor smoothing, no bespoke lerper. | The framework default; the single-driver rule is satisfied because nothing else in TourBuilder lerps that group. It self-disposes on session teardown. |
| VC7  | The store is the **real** `createViewingStore()`, constructed once per viewing session before the loader screen, and it is also the store handed to the framework (`callbacks.tracking`, `createGpsPositionHandler`, `updateDeviceOrientation`, alignment selectors). Composition dispatches `loadTour(tour)` only — `initZones` / `setWaypointZone` / `markWaypointVisited` are component 8's job. | `createViewingStore` wraps `createSlamAppStore`, so the framework slices (`gpsData`, `tracking`, alignment) and the tour slices are one store — no second store, no bridging. Component 8's contract already owns the zone dispatches; duplicating them here would double-init. |
| VC8  | The scene ticks from the framework frame loop: `registerFrameUpdate((dt) => scene.tick(dt))`, unregistered on teardown. | Plan A21 ("call once per frame from whichever loop owns the app"); in a session that loop is the framework's, which also drives the anchors and the alignment lerper — one loop, consistent ordering. |
| VC9  | **The 2D map (component 7) is mounted into the WebXR `dom-overlay` root — which is precisely the `container` element passed to `controller.enable()`** (`buildSessionOptions` sets `sessionOptions.domOverlay = { root: rootElement }` from it), so the HUD and the map must be *children of that container*, not siblings. Toggled by a HUD button, and stays mounted (same instance) across the AR-entry screen → in-session transition, with `map.resize()` on every show. | The framework's `initAR` already supports `dom-overlay` (`isolationOptions.enableDomOverlay` → `optionalFeatures: ['dom-overlay']`, VC3 passes it), and component 7 is deliberately plain-DOM Leaflet for exactly this reason. Its markers are driven by `computeMarkerViewModels` from the live store — the same wiring the authoring app already uses. Where `dom-overlay` is unsupported the button is hidden and the map is available only before entering AR (feature-detected, never fatal). |
| VC10 | The map's user dot is fed from the same GPS fixes the session already receives: `onGpsPosition` → `createGpsPositionHandler(store)` (framework) **and** `map.setGpsPosition(lat, lon)` / `map.render(buildMapData(...))`. | One watch, one source of truth. `startGpsWatch` is owned by the controller (VC3), so composition must not start a second watch — and does not need `createLiveGpsPositionSource` (that is authoring's seam). |
| VC11 | **Asset provider and cache warming come from `openRemoteTour`** and are injected into the scene; `cacheWarming` is awaited by nobody but is surfaced as a small "offline-ready" HUD indicator when it resolves. | Component 6 owns tier-1 memory and the remote→local switch (§2.5.5); the composition's only job is to inject it and to show the visitor that the tour now works without connectivity — a real field concern on a walk that leaves coverage. |
| VC12 | **Teardown is explicit and ordered**: `scene.dispose()` → unregister frame update → `map.destroy()` → `controller.disable()` (stops watches, ends session) → `assetProvider` refs verified released. Wired to both the visitor's "End tour" button and the framework's external-session-end path. | Component 8's replay test asserts zero outstanding asset refs after `dispose()`; that invariant is only real if composition actually calls it on every exit path, including the Android system back gesture (which the controller reports via its wrapped `onSessionEnd`). |
| VC13 | **Session end ≠ tour end.** An externally-ended session returns to the AR-entry screen with the store intact (visited waypoints, loaded tour, warmed cache), offering "Re-enter AR". Re-entry builds a fresh adapter + `createTourScene`, which re-dispatches `initZones` (verified: `tour-scene.ts:229`) — so **zones reset to IDLE while visited ids survive**, and a knight the visitor is standing next to must re-cross its boundary rather than being silently already-ACTIVE. | The store lives outside the session by construction (VC7). Dropping the visitor back to a cold load screen after an accidental back-swipe would re-download and reset progress mid-walk — the viewing-side equivalent of the data loss AC10/AC12 addressed for authoring. |
| VC14 | **Visited-waypoint progress persists across reloads** via a tiny `src/app/viewing/progress-store.ts` (localStorage, key = `tour:<tour.id>`, value = visited ids array; restored right after `loadTour` by dispatching `markWaypointVisited` per id; cleared by an explicit "Restart tour" control). | Same production concern as AC10: a phone tab evicted mid-walk otherwise loses the breadcrumb/next-marker guidance. `markWaypointVisited` is documented idempotent, so replaying ids is safe. localStorage (not OPFS) because the payload is a handful of short strings, synchronous, and needed before the first frame — AC10's OPFS reasoning was about a growing action log, which this is not. |
| VC15 | **Explicit error states, one screen each, all retryable**: (a) missing/blank `?tour=` value; (b) `openRemoteTour` failure — distinguish component 6's own error types (CORS/unreachable = fatal with the "check the link is publicly shared" hint; range-refused already falls back internally, so it never surfaces); (c) `TourValidationError` from the zip's `tour.json` ("this tour file is damaged"); (d) `status === 'unsupported'` from the controller → "AR is not available on this device/browser" with the map-only fallback still usable; (e) `status === 'error'` (permission denied / `initAR` failure) → inline reason + retry; (f) `onAudioBlocked` from the scene → HUD notice telling the visitor to tap once. | These are the six ways a real visit fails outdoors. Each maps to an already-existing signal (component 6's typed errors, the store's validator, the controller's status, component 8's `onAudioBlocked`) — the work is surfacing them, not inventing them. |
| VC16 | **Wake lock is reused, not rebuilt**: `requestWakeLock()` (`src/app/authoring/wake-lock.ts`) is moved to `src/app/wake-lock.ts` (a pure move + import update, its own commit) and used on the non-immersive screens (loader, AR-entry/map). Not needed inside the session — an immersive XR session keeps the display awake. | The module already exists and is tested; a viewing-mode copy would trip `jscpd`. Moving it up one level is the honest expression of "both modes use it". |
| VC17 | No `beforeunload` guard in viewing mode. | Nothing unsaved: progress is persisted (VC14) and the tour is remote. The authoring guard existed because the draft was RAM-only. |
| VC18 | **The composed-flow replay test (the §2.4 mandate) runs in Node against a real packed zip served over real HTTP ranges**, with only the rendering layer faked: `packTour` (component 5) builds a `tour.zip` from waypoints synthesised from the real Task 1 recording → component 6's own `fixture-server.ts` serves it → **real** `openRemoteTour` (real 206 range reads, real `RefCountedAssetProvider`) → **real** `createViewingStore` + `loadTour` → **real** `createTourScene` (real proximity driver, real orchestrator) against `FakeSceneAdapter` → the recorded walk is fed through `getUserWorldPos`. Asserts: the set of waypoints that became visible equals the set whose true minimum horizontal distance dropped below `activeRadius`, PREFETCH precedes ACTIVE for each, `tourProgress.visitedWaypointIds` matches, and after `dispose()` outstanding asset refs are zero. | This is TASK.md §2.4's exact wording ("loads a real tour zip, plays one of your Task 1 walks through the app in viewing mode, asserts the right knights become active at the right points"), and it is a strictly larger claim than component 8's own replay e2e: that one hand-built a `Tour` object and a counting provider, this one gets its tour and its bytes through the real packaging → hosting → range-read → asset-provider chain. Building the zip with `packTour` rather than committing a binary fixture keeps authoring and viewing provably compatible and adds nothing to the repo's size. **Mechanics checked in review:** `openRemoteTour` must be given `createObjectUrl`/`revokeObjectUrl` (its documented injection points — `URL.createObjectURL` does not exist in Node); `packTour` takes `Map<AssetId, File>` and Node 20's global `File` satisfies it; asset bytes can be a few dummy bytes because `FakeSceneAdapter` never parses them; and the identity `lat`=X/`lon`=Z convention is legal because `validate-tour.ts` checks coordinates with `requireFiniteNumber` only — **no lat/lon range check** (verified). That last point is load-bearing for the whole test and invisible from the test file, so it gets an explicit comment there: if the contract ever gains a bounds check, this test must fail loudly rather than mysteriously. |
| VC19 | The replay test injects an **identity anchor factory** (the `lat`=X / `lon`=Z convention component 8's demo and replay e2e already document) rather than a real `GpsAnchor`. The real geo path is covered separately by `ar-seams.test.ts` (VC5, against a synthetic alignment matrix + zero reference, asserting `toWorld` agrees with `calcRelativeCoordsInMeters` + `nueToArLocal`) and by a documented manual field check. | Honest scoping: a real `GpsAnchor` needs an alignment matrix produced by the closed-source core from live GPS + AR poses; there is no WebXR and no alignment in Node. Faking one would test the fake. The seam is one small module, so the untested-by-machine surface is exactly `initAR` + `enableArWorldGroupAlignment` + `createGpsAnchor` wiring — the part `pnpm dev` on the phone verifies. |
| VC21 | **`ar-seams.ts` wraps the framework anchor and re-defines `isFullyAnchored`** (R2, blocker): the wrapper reports anchored only when *all* of — the base anchor says anchored, `toWorld(coord)` is non-`null` (zero-ref **and** alignment exist), and the object's current world position is within the anchor's own `distanceThreshold` (2 m) of that target — hold. Unit-tested with a fake object/alignment. | **R2 (found in review, blocker).** `gps-anchor.ts:215-217` sets `phase = 'anchored'` and `isFullyAnchored = true` **immediately** for a `skipBootstrap` anchor (which VC5/R1 now requires), while the mesh still sits at the `arWorldGroup` origin and `firstCommitPending` has not fired — the first commit cannot happen until an alignment matrix exists, which takes seconds of walking. Component 8 feeds exactly the anchors reporting `isAnchored()` to the proximity driver (`three-scene-adapter.ts:212`, `waypoint-presenter.ts:184`), so unwrapped this means: **at session start every waypoint is at the origin, i.e. on top of the visitor → every knight goes PREFETCHING→ACTIVE at once, spawns in the visitor's face and is marked visited** — the tour is destroyed in the first second, and VC14 would faithfully persist that corruption. The wrapper is the smallest fix that keeps component 8 untouched, and its "position agrees with the target" condition is self-verifying rather than a timing guess. |
| VC22 | **Two tiny framework accessors are added upstream** (R3, blocker): `getXrSession(): XRSession \| null` and `getXrReferenceSpace(): XRReferenceSpace \| null` in `GpsPlusSlamJs_AppFramework/src/ar/webxr-session.ts`, beside the existing `getScene`/`getCamera`/`getArWorldGroup`, with their sidecar `.md` entries and unit tests. Composition then builds component 8's XR ray seam: `xrSession` = the accessor's session; `getTargetRayMatrix = (e) => e.frame.getPose(e.inputSource.targetRaySpace, getXrReferenceSpace())?.transform.matrix → Matrix4`. Own commit, run `pnpm run test:framework`, and an upstream-PR candidate (TASK.md §2.6). | **R3 (found in review, blocker).** Component 8's `createThreeSceneAdapter` needs `xrSession` (to listen for `select`) and `getTargetRayMatrix` — and **the framework currently exposes neither**: `webxr-session.ts` exports `getScene`/`getArWorldGroup`/`getCamera`/`getCurrentArPose` but no session or reference space, and `ArSessionCallbacks.onFrame` is typed `(() => void) \| null` — no frame, no session. Without this, **tap-to-play is dead in a real session**: the single most-demoed interaction of the whole tour would ship broken while every unit test stayed green (component 8's tap tests inject the seam). The reference space must come from the framework rather than a self-requested `local-floor` space, because three may install an offset reference space and a second, independently-requested one is not guaranteed to agree — a subtly mis-aimed ray is worse than none. This is the one place this plan stops being purely additive; it is two getters, no behaviour change. |
| VC23 | **Alignment convergence is a designed screen state, not a blank wait.** While `selectAlignmentMatrix` is `null` the HUD shows the framework's own coaching via `computeOnboardingGuidance(selectTrackingQuality(state))` ("move the phone / walk a few metres"), and no waypoint is anchored (VC21) so nothing appears. | The gap between "session started" and "content anchored" is unavoidable — the closed core needs GPS+AR pose pairs to solve alignment — and it is exactly the moment a visitor concludes the app is broken. AnchorStarter already establishes this pattern with the same two framework functions (`main.ts` `renderGuidance`), so it is reuse, not new UX invention. It also gives VC21's gate a visible explanation. |
| VC24 | **Map degrades to markers-only when tiles cannot load** (offline after the cache warm, or a blocked tile host): `createTourMap`'s `onTileError` flips a one-shot HUD note ("map tiles unavailable offline"); markers, the user dot and the waypoint statuses keep working on the blank canvas. No retry loop. | The whole point of VC11's cache warming is that the tour survives losing connectivity — but Leaflet tiles are *not* in the tour zip and will fail exactly then. Silently showing a grey void reads as a crash; one honest note does not. `onTileError` already exists on the component's options, so this is wiring, not new code. |
| VC25 | **A device checklist is written down** (`src/app/viewing/README.md`): scan a real QR from component 5 → tour loads → gate → enter AR → **alignment coaching shows, then content appears only once aligned (VC21/VC23) — nothing spawns at the origin on entry** → walk the route → knight appears at ~10 m → **tap plays the story audibly (R4) with transcript (R3's ray seam)** → map toggles in overlay → back gesture returns to the AR-entry screen → re-enter keeps progress and re-arms zones → reload keeps progress → airplane mode after "offline-ready" still works (tiles degrade per VC24). | VC19 leaves a deliberate machine-untested surface; a written, repeatable manual pass is what makes "production ready" a claim rather than a hope. Mirrors the authoring plan's hand-verification steps. |

---

## Architecture

### `src/app/main.ts` (edit)

```ts
const mode = resolveAppMode(url);
if (mode === "authoring") mountAuthoringApp(root);
else mountViewingApp(root, url.searchParams.get("tour") ?? "");
```

`?tour=` is read here, once (component 6 owns no `?tour=` parsing — its C3);
the raw value goes straight to `openRemoteTour`, which owns share-link
normalization (`normalizeShareUrl`).

### `src/app/viewing/viewing-app.ts` — the composed flow

Five screens in one root, one mounted at a time, same mount/`destroy()`
discipline as the authoring app:

```
mountLoadingScreen(root)                       // + wake lock
  store = createViewingStore()
  openRemoteTour(tourUrl) → { tour, assetProvider, cacheWarming }
    ✗ → mountErrorScreen(...)                  // VC15 (a)(b)(c), retryable
    ✓ → store.dispatch(loadTour(tour))
        restoreProgress(store, tour.id)        // VC14

mountOnboardingGate(root, { ...framework permission fns, createAudioContext, onComplete })
  → onComplete(audioContext): keep the context (VC4), destroy gate

mountTourEntryScreen(root, { tour, store, controller })   // VC3
  tour name / description / n POIs / "offline-ready" once cacheWarming resolves
  map = createTourMap(mapHost)  — overview before the walk (VC9)
  [Enter AR] → controller.enable({
      container: arHost,
      isolationOptions: { enableDomOverlay: true },
      callbacks: { tracking: { store, onTrackingRestart } },
      onGpsPosition: (p) => { gpsHandler(p); map?.setGpsPosition(p.lat, p.lon); },
      onOrientation: (o) => store.dispatch(updateDeviceOrientation(o)),
    })
    ✗ → inline error / unsupported notice (VC15 d/e), map stays usable
    ✓ → startSession()

startSession():
  arWorldGroup = getArWorldGroup(); camera = getCamera()
  enableArWorldGroupAlignment({ store, arWorldGroup })            // VC6
  AudioContext.setContext(unlockedCtx); listener = new AudioListener()  // VC4/R4
  camera.add(listener)                                            // order matters
  adapter = createThreeSceneAdapter({
    parent: arWorldGroup, camera, audioListener: listener,
    createAnchor, toWorld, getUserWorldPos,                        // VC5/VC21, ar-seams.ts
    orbPoolSize: TRAIL_ORB_POOL_SIZE,
    xrSession: getXrSession(),                                     // VC22/R3
    getTargetRayMatrix: (e) =>
      matrixFromPose(e.frame.getPose(e.inputSource.targetRaySpace,
                                     getXrReferenceSpace())),      // VC22/R3
  })
  scene = createTourScene({ store, assetProvider, adapter,
                            hysteresisFraction: 0.15,
                            onAudioBlocked, log })
  unregisterTick = registerFrameUpdate((dt) => scene.tick(dt))     // VC8
  mountHud(domOverlayRoot)     // map toggle, End tour, status line, notices
  store.subscribe(persistProgress)                                 // VC14

endSession(reason):                                                // VC12/VC13
  scene.dispose(); unregisterTick(); mapDetachFromOverlay()
  controller.disable()
  reason === "external" | "user" → back to mountTourEntryScreen (store intact)
```

### `src/app/viewing/ar-seams.ts` (VC5) — the one geo↔world module

```ts
export interface ArSeamDeps {
  readonly store: { getState(): unknown };
  readonly getArWorldGroup: () => Object3D | null;
  readonly getCamera: () => Camera | null;
  readonly getCurrentGpsPoint: () => LatLong | LatLongAlt | null;
}

export interface ArSeams {
  /** `skipBootstrap: true` (R1); the returned anchor's `isFullyAnchored` is the
   *  wrapper's stricter rule (R2/VC21), never the framework anchor's raw flag. */
  createAnchor(object3D: Object3D, coord: TourCoord): SceneAnchor;
  /** GPS-world NUE → AR-local → THREE world. `null` before alignment/zero-ref. */
  toWorld(coord: TourCoord): Vector3 | null;
  /** Camera world position; `null` before the first pose. */
  getUserWorldPos(): Vector3 | null;
}

export function createArSeams(deps: ArSeamDeps): ArSeams;
```

Pure composition of `createGpsAnchor`, `calcRelativeCoordsInMeters`,
`nueToArLocal`, `selectAlignmentMatrix`, `selectZeroReference` — no new math.
`toWorld` allocates one `Vector3` per call — acceptable because component 8
calls it only when it re-windows the trail (`TRAIL_UPDATE_INTERVAL_S`, 4 Hz),
never per frame per orb. `getUserWorldPos` writes into a reused scratch vector
(it *is* per frame).

### `src/app/viewing/progress-store.ts` (VC14)

```ts
export function restoreProgress(dispatch, tourId: string): void;   // never throws
export function persistProgress(tourId: string, visitedIds: readonly string[]): void;
export function clearProgress(tourId: string): void;
```

Framework-free, storage injected for tests (defaults to `localStorage`;
a `QuotaExceededError` or a Safari private-mode throw degrades to no-op).

### `src/app/viewing/hud.ts`

The dom-overlay HUD: map toggle, End tour, "offline-ready" indicator, the
status line (tracking/GPS-waiting), and the notice channel VC15 (f) writes to.
Plain DOM, no store knowledge beyond an injected `subscribe`/`getState`.

### `src/app/wake-lock.ts` (VC16)

Moved from `src/app/authoring/wake-lock.ts`, unchanged behaviour and tests
(`src/app/wake-lock.test.ts`), imports updated in `authoring-app.ts`.

---

## Testing

### `src/app/viewing/ar-seams.test.ts` (VC5/VC19)

Node, no jsdom. Against a synthetic zero reference, a synthetic non-identity
alignment matrix and a stub `arWorldGroup`/`camera`:

- `toWorld` returns `null` while the alignment **or** the zero reference is
  missing (both cases asserted separately — a silent wrong-frame position is
  the bug class `gps-anchor.ts`'s own sidecar warns about).
- `toWorld(coord)` equals `arWorldGroup.localToWorld(nueToArLocal(alignment,
  calcRelativeCoordsInMeters(zero, coord, alt, 0)))` — i.e. it is provably the
  same frame the anchors commit into, expressed against the framework
  functions rather than a hand-computed expectation.
- Round-trip sanity: a coord at the zero reference maps to the group origin;
  a coord 10 m north maps 10 m away (magnitude only — the direction is the
  alignment's business).
- `getUserWorldPos` returns `null` before a camera exists, the camera's world
  position after.
- **VC21/R2 — the anchored gate.** With a stub anchor reporting
  `isFullyAnchored: true` (what a real `skipBootstrap` anchor does from frame
  one) and the object at the origin: the wrapper reports **not** anchored while
  alignment is `null`; still not anchored once alignment appears but the object
  has not been committed to its target; anchored only once the object's world
  position is within `distanceThreshold` of `toWorld(coord)`. This is the test
  that stands between the tour and "every knight activates at the origin".
- **VC5/R1 — `skipBootstrap` is passed.** Asserted against a captured
  `createGpsAnchor` options object, with a comment naming the failure it
  prevents (bootstrap medians the object pose and overwrites the authored
  coordinate).

### `src/app/viewing/audio-listener.test.ts` (VC4/R4)

The unlocked context is installed via three's `AudioContext.setContext` **before**
the listener is constructed, asserted by `listener.context === unlocked` **and**
`listener.gain.context === unlocked` — the second assertion is the one that
fails under the `listener.context = ctx` idiom the component-9 README currently
shows, and it is the difference between an audible story and silence.

### Framework: `getXrSession` / `getXrReferenceSpace` (VC22/R3)

Added with the framework's own conventions — unit tests beside
`webxr-session.ts`'s existing accessor tests (null before a session, the live
values during one, null again after `resetWebXRState()`), sidecar `.md` updated,
`pnpm run test:framework` green before TourBuilder consumes them.

### `src/app/viewing/progress-store.test.ts` (VC14)

Injected fake storage: round-trip; unknown/corrupt JSON → no dispatch, no
throw; ids for a *different* tour id are not restored; a throwing storage
(private mode) degrades silently; `clearProgress` removes only that key.

### `src/app/viewing/viewing-app.test.ts` — screens, jsdom

Mocks the framework's permission functions (granted), `AudioContext`, and the
`EnableGpsArController` (a fake whose `enable()` resolves `{ ok }` /
`{ ok: false, error }` and whose status is drivable). Real store, real
onboarding gate, real cloud-loader against the fixture server.

1. Happy sequence: loader → gate → entry screen, tour name/POI count rendered.
2. Blank `?tour=` → error screen, gate never mounts (VC15 a).
3. Loader failure (fixture server returns 403) → error screen with retry;
   retry re-invokes `openRemoteTour` (VC15 b).
4. A zip whose `tour.json` violates an invariant → the validation error screen,
   not a crash (VC15 c).
5. `status: 'unsupported'` → AR button disabled with the honest message, map
   still mounted (VC15 d).
6. `enable()` resolving `{ ok: false }` → inline retryable error (VC15 e).
7. External session end → back on the entry screen with `tour` still loaded
   and visited ids intact, and re-entry re-seeds every zone to `IDLE`
   (VC13) — a waypoint left `ACTIVE` must not survive into the new session.

### `src/app/viewing/viewing-replay.e2e.test.ts` — **the §2.4 composed-flow test** (VC18)

`@vitest-environment node`. Fixture build (in `beforeAll`):

1. Read `recordings/2026-06-22_16-06-59utc.zip` via `replayRecording`
   (same harness as every other replay e2e); take the odometry path.
2. Synthesise 3–4 waypoints from that path (one on-route knight with model +
   audio + transcript, one sprite-only, one deliberate **near-miss** that only
   ever reaches PREFETCHING, one content-free breadcrumb stop) plus the
   breadcrumb polyline, using the `lat`=X/`lon`=Z convention (VC19).
3. `packTour(tour, assetFiles)` → a real store-mode `tour.zip`; serve it from
   component 6's `fixture-server.ts`.

Then the composed run: `openRemoteTour(url)` (real range reads) →
`createViewingStore()` + `loadTour` → `createTourScene({ store, assetProvider:
theRealOne, adapter: FakeSceneAdapter, hysteresisFraction: 0.15 })` → feed the
recorded walk through `getUserWorldPos` + `scene.tick(dt)`.

Assertions, all geometry-derived (none hand-tuned):

- **The mandate:** the set of waypoints ever shown equals the set whose true
  minimum horizontal distance to the walk dropped below `activeRadius`; the
  near-miss waypoint is instantiated (prefetched) but **never shown**.
- Ordering: every visual is instantiated before it is first shown (anti-jank).
- Each shown waypoint's first `ACTIVE` tick happens within one sample of the
  route index where the true distance first crosses `activeRadius`.
- `selectVisitedWaypointIds` after the walk equals the shown set (component
  8's "visited = reached" rule, plan A18).
- The bytes really came through the zip: at least one asset URL was produced
  by the real provider, and after `dispose()` outstanding refs are **zero**.
- A second run with the SAME fixture server confirms the local-cache warm
  path serves the tour identically (component 6's remote→local switch is
  transparent to the scene, §2.5.5).

Tap-to-play audio stays out of the replay by TASK.md's own instruction
("cover that playback wiring with the component's own tests") — component 8's
`story-session` unit tests and the jsdom adapter test own it.

### `src/app/mode.test.ts` (unchanged) / `viewing-placeholder.test.ts` (deleted)

### Vite / tooling

- `vite.config.ts`: no new entry — `src/app/index.html` already covers both
  modes. Confirm Leaflet CSS is imported on the viewing path too.
- `check:cycles`: `./src/app/main.ts` already listed; no change.
- `config/.dependency-cruiser.cjs`: no new rule — `src/app/viewing/` is inside
  the existing `^src/app` `includeOnly` and the existing
  `components-and-store-not-to-app` forbidden rule.
- `knip`: the deleted placeholder must not leave an orphan export; run
  `pnpm run check:deadcode` in-package.

---

---

## Review round 1 — findings folded in above

Reviewed against the source, not from memory. Four defects in the first
draft, two of which would have shipped a broken tour with a green test suite:

| ID | Severity | Defect in draft 1 | Where fixed |
| -- | -------- | ----------------- | ----------- |
| R1 | Blocker | Anchors created without `skipBootstrap`: the framework's default object-pose bootstrap would median the mesh's own (origin) pose and **overwrite the authored waypoint coordinate**. | VC5 |
| R2 | Blocker | `isFullyAnchored` is `true` from frame one for a `skipBootstrap` anchor, before any alignment exists — every waypoint sits at the AR origin, on top of the visitor, so **all knights activate and are marked visited in the first second**, and VC14 would persist the corruption. | VC21 (+ VC23 for the visible explanation) |
| R3 | Blocker | Component 8's XR ray seam has no supplier: the framework exports no session/reference-space accessor and `ArSessionCallbacks.onFrame` carries no frame. **Tap-to-play would be dead on device while every unit test stayed green.** | VC22 (two upstream accessors) |
| R4 | High | `listener.context = audioContext` (the idiom component 9's README documents) leaves `listener.gain` on the old context — **stories play silently**. | VC4 + `audio-listener.test.ts` + a docs fix to component 9's README |
| R5 | Medium | Offline map tiles fail exactly when the cache-warm "offline-ready" promise makes the tour usable offline — a grey void reads as a crash. | VC24 |
| R6 | Low | Test mechanics unstated (`createObjectUrl` injection in Node; the identity coordinate convention depending on the validator having no lat/lon bounds). | VC18 |

Two draft-1 claims **survived** review by verification rather than assumption:
`validate-tour.ts` really does bound-check nothing but finiteness (so VC19's
identity convention is legal), and `tour-scene.ts` really does re-dispatch
`initZones` on mount (so VC13's re-entry semantics are free).

The one scope change: this plan is no longer purely additive — VC22 adds two
getters to the framework. That is intended and small, but it means the
framework gate runs too, and it lands **before** any TourBuilder AR code.

---

## Next steps

1. Iterate this plan with an LLM as critical reviewer; commit meaningful
   revisions. *(Round 1 done — see above.)*
2. `wake-lock.ts` move (VC16) — mechanical, own commit, no behaviour change.
3. **Framework: `getXrSession` + `getXrReferenceSpace` (VC22/R3)** — own commit
   in `GpsPlusSlamJs_AppFramework`, sidecar + tests, `pnpm run test:framework`
   green. First, because step 6 cannot be wired without it and it is the only
   cross-package change here.
4. `ar-seams.ts` + `ar-seams.test.ts` (VC5/VC21, incl. R1's `skipBootstrap` and
   R2's anchored gate) — the hardest new logic, pure, fastest feedback, and the
   thing every later step depends on.
5. `progress-store.ts` + test (VC14) — small, independent.
5. `viewing-app.ts` screens 1–3 (loader → gate → entry screen) with the map
   overview and the error states VC15 (a)(b)(c), no AR yet. Verified with
   `pnpm dev` against a really hosted zip (the component 6 `RECIPE.md` link).
6. AR entry + `startSession`/`endSession` (VC3/VC6/VC8/VC12/VC13) — the first
   real `GpsAnchor` in this repo's tour path. Verified on the phone outdoors
   against a tour authored with Part 1, following the VC20 checklist.
7. HUD + dom-overlay map (VC9/VC10) and the remaining error states VC15
   (d)(e)(f).
8. `viewing-app.test.ts` (screens, jsdom).
9. `viewing-replay.e2e.test.ts` (VC18) — the §2.4 mandate.
10. Delete `viewing-placeholder.ts` + its test; point `main.ts` at
    `mountViewingApp`.
11. `src/app/viewing/README.md` + the VC20 device checklist; update
    `src/app/README.md` (both modes now real).
