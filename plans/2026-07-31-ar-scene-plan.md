# 2026-07-31 — Component 8 plan: AR viewing scene (`ar-scene`)

**Status:** specced in a design grilling on 2026-07-31 (Nico). Written against the
pinned §2.2 contract in [`Shared-Contract.md`](./Shared-Contract.md) — read that
first; every type, slice, selector and the asset-provider interface used below
come from it and are **not** re-opened here.

Scope note: this plan describes the **full component**, delivered in one go — no
iteration slicing. It is written for a deployable component, not a prototype:
every lifecycle, failure and teardown path below has a defined answer and a test.

---

## 1. What this is and what problem it solves

Component 8 is the Three.js/WebXR side of **viewing mode**. A visitor has scanned
a QR code, the tour is loaded into the store, and they are now physically walking
outdoors holding a phone. This component is what they actually see and touch:

- glowing breadcrumb orbs on the ground guiding the last stretch to the next stop,
- a knight (GLTF model) or a sprite standing at each waypoint, that quietly loads
  while the visitor is still far away and appears when they get close,
- tapping the knight plays its story (spatialised audio) with a floating text
  transcript alongside, for noisy outdoor use,
- and everything freed again when the visitor walks away, so a 45-minute tour on
  a mid-range Android does not end with the tab being killed.

It **composes** rather than invents: comp 1 (clickable billboard + audio player +
transport panel), comp 2 (in-world text), comp 3 (store + selectors), comp 4
(proximity/zone state machine), comp 6 (asset-provider). Its own new work is the
three things nobody else owns: **geo→world anchoring of the tour**, **tier-2
memory** (parsed GLTF + GPU handles), and **the trail**.

It is driven entirely by subscribing to the store. It never touches the GPS
device, never touches the zip, never constructs the store or the provider.

---

## 2. Goals, non-goals, success criteria

### Goals

1. Turn a loaded `Tour` into anchored, world-space scene content (§2.5.1 — no geo
   math outside the framework's anchoring step).
2. Drive each waypoint's visual through the zone lifecycle from comp 4, hiding the
   GLTF fetch+parse cost entirely inside the PREFETCH window (§2.5.3 anti-jank).
3. Bound memory by construction — both tiers (§2.5.5): the Blob tier via balanced
   `release()`, the GPU tier via a capped LRU + explicit `dispose()`.
4. Tap-to-play a waypoint's story with its transcript, one story at a time.
5. Guide the last approach with a bounded, recycled pool of breadcrumb orbs.
6. Survive the ugly paths: missing assets, un-bootstrapped anchors, mid-load
   walk-away, WebGL context loss, session end, tour reload.
7. Be provable **deterministically on a desktop in CI**, on a real Task 1 walk.

### Non-goals (owned elsewhere)

- Store construction, mode selection, `?tour=` parsing → bootstrap / D13.
- Zip reading, range requests, cache warm-up → comp 6, behind `AssetProvider`.
- Permissions, "Start" button, entering AR, unlocking the `AudioContext` → comp 9.
- The 2D map → comp 7.
- Authoring → comp 10.
- Wiring 6 + 8 + 7 + 9 into viewing mode → Goal-2 composition (§2.4).

### Success criteria

- On the checked-in Task 1 recording, replayed in CI: the set of waypoints that
  ever became visible **equals** the set whose true minimum horizontal distance
  went below `activeRadius` — no hand-tuned expectations.
- Every `buildVisual` precedes its first `setVisible(true)`; no visual is ever
  shown without a completed build.
- After the walk plus `dispose()`, outstanding asset-provider ref-counts are
  **zero** — including when disposal happens mid-parse.
- Concurrent built visuals never exceed `LRU cap + presenters in PREFETCHING/ACTIVE`;
  concurrent parses never exceed 2; orbs never exceed the pool size.
- The demo runs on a laptop with no phone, no network and no zip, and shows those
  invariants live.
- Package gate (`pnpm test` in `GpsPlusSlamJs_TourBuilder/`) green, including
  jscpd, dpdm, dependency-cruiser and knip.

---

## 3. Decisions at a glance

Continues the Shared-Contract style with an `A` prefix (component 8 decisions).

| #   | Decision                                                                                                                                                   | Rationale / consequence                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Comp 8 owns geo→world anchoring.** It calls `createGpsAnchor` per waypoint and per breadcrumb orb, and exposes the anchored objects to the proximity driver. | Nobody else owns it; without it the component is untestable without an external harness. `anchorFactory` is injectable.                              |
| A2  | **Comp 8 owns the proximity driver instance** (comp 4 stays untouched and reusable).                                                                        | Comp 8 is the only holder of anchored positions; routing `getObjects` through composition would be ownerless glue.                                   |
| A3  | **Breadcrumb: bounded recycled anchor pool + pure windowing.** ≤16 orbs, re-pointed via `anchor.setGpsPoint()`.                                              | One anchor per trail point does not survive a 20-minute walk. Constant per-frame cost, geo math stays in the framework.                              |
| A4  | **Trail window = the nearest points by horizontal distance within 15 m.** No trail order, no direction, no dependency on next-unvisited.                     | Simplest rule that works. Accepted: on a route that loops back, orbs from both passes show at once.                                                  |
| A5  | **One `WaypointPresenter` per waypoint** with an always-alive anchored root; only the heavy children (visual, transcript, audio) follow the zone.            | The driver needs a stable position even at IDLE. One dispose path instead of four parallel maps.                                                     |
| A6  | **Per-waypoint generation token** guards every async load; resolved-late results are disposed + released, never attached.                                     | The visitor keeps moving during a fetch+parse. Without this you leak ref-counts or attach knights to abandoned waypoints.                            |
| A7  | **`release()` only on a resolved `getAssetUrl`.** A rejection must not release.                                                                             | D14b rejects without incrementing; releasing there is a double-release. Pinned by test.                                                              |
| A8  | **Parse concurrency cap 2**, FIFO queue.                                                                                                                    | Several waypoints can enter PREFETCHING in one tick; `parseAsync` is main-thread, and unbounded parallelism defeats the whole point of the zone.     |
| A9  | **Tier-2 LRU of parsed templates, cap 3; presenters hold `SkeletonUtils.clone`s.** Real `dispose()` + `release()` happen on **eviction**, not at IDLE.       | §2.5.5 asks for it; makes walk-back free. Softens the zone table's "IDLE → dispose" into "IDLE → drop clone; eviction → free". Bounded, so not a leak. |
| A10 | **Presenter dispose never deep-traverses.** Detach + drop the clone only; never `three-dispose` a clone.                                                    | Clones share geometry/material with the template other presenters use. A recursive dispose would nuke them. Pinned by test.                          |
| A11 | **`RaySource` seam** — `pointerRaySource` (desktop, reuses shared `pointer-tap-picker` + `tap-gate`) and `xrSelectRaySource` (WebXR `select`).               | Comp 1 already named this as the only desktop/AR difference. No tap-gate on the XR path — `select` **is** the gesture.                               |
| A12 | **Pickable = ACTIVE visuals + a shown transcript's own controls.** Orbs never pickable. Model picking walks `.parent` to the stamped `WaypointUserData`.     | The raycaster does not skip invisible objects — a hidden mesh in the target set eats taps aimed past it (comp 1's existing discipline).              |
| A13 | **One story at a time, globally.** Tapping B stops A. Tapping the same knight toggles pause/resume. Leaving ACTIVE mid-story stops it.                       | Two knights 8 m apart otherwise become noise.                                                                                                        |
| A14 | **Transcript: child of the waypoint group, offset _below_ the visual, built lazily on first play**, manual paging only, kept until IDLE.                     | A label above a 1.8 m knight is outside a portrait FOV at 3 m. Text is inline (D4) — no fetch, no ref-count, no race.                                |
| A15 | **All text rendering, wrapping, paging, `hitTest` and HTML→Canvas fallback stay in comp 2.** Gaps get fixed in comp 2, never reimplemented here.             | Keeps comp 2 independently demoable and jscpd/boundaries green.                                                                                     |
| A16 | **Audio: injected `AudioListener`, never created or resumed here.** Comp 8 checks `context.state`, attempts one resume, else fires `onAudioBlocked`.         | Comp 9 owns the unlock gesture. Silent audio failure is the worst possible field outcome, so it is surfaced, not swallowed.                          |
| A17 | **Audio assets are fetched lazily on first tap**, released at IDLE, same generation guard as models.                                                        | No point downloading MP3s for knights nobody taps.                                                                                                  |
| A18 | **`visited` = the first `→ACTIVE` edge** (`markWaypointVisited` dispatched there).                                                                          | Only trigger that works for content-free waypoints; matches what comp 7 already documents; keeps `selectNextUnvisitedWaypoint` from pointing backwards. |
| A19 | **Un-bootstrapped anchors are excluded from `getObjects()`.**                                                                                              | A `GpsAnchor` in `bootstrap` phase has a provisional position. Accepted: nothing appears for the first ~7 s (comp 9 shows "locating…").               |
| A20 | **Three layers — `core/` (pure) · `runtime/` (orchestration, no `three`) · `view/` (Three.js adapter)** — deviating from the repo's `core`/`view` convention. | See §4.1: it is the only split under which the §2.4 replay assertion can be written at all in this package. Documented in the component README.       |
| A21 | **`tick(dt)` does not self-register** with the framework frame loop by default (opt-in flag), mirroring `wayfinding-hud`'s `autoRegisterFrameUpdate: false`. | Deterministic under test, one obvious call site, no double-tick hazard.                                                                              |
| A22 | **Tour change → full rebuild**, not an incremental diff.                                                                                                   | Happens at most once per session; diffing is real complexity for no benefit.                                                                        |
| A23 | **Demo is desktop-only**, driven by comp 4's existing `demo-walk.json` with an identity anchor factory. No `enable-gps-ar` path.                             | The AR path is comp 9's job; building it here means writing comp 9 badly and discarding it at Goal-2. Comp 8's contract is "injected scene/camera/ray source", so AR is a substitution, not new logic. |

---

## 4. Architecture

### 4.1 Layering (A20) — and why it deviates

The repo convention is `core/` (pure, framework-free) + `view/` (Three.js/DOM).
Component 8 uses **three** layers:

```
core/      pure functions & reducers. No THREE, no DOM. Coverage-counted.
runtime/   the orchestrator: presenters, lifecycle, generation tokens,
           dispose ordering, driver wiring, store subscription.
           Stateful and effectful, but imports NO three and NO DOM —
           all rendering goes through the SceneAdapter port.
view/      exactly one real adapter (three-scene-adapter) + the Three-specific
           pieces: GLTF parse, SkeletonUtils.clone, orb pool, comp 1/comp 2
           wiring, ray sources. Thin and mechanical. Demo-verified.
```

**Why.** TourBuilder has no Playwright and no browser runner; its e2e tests are
vitest (node/jsdom) and there is no WebGL in that environment. Under a plain
`core`/`view` split, the file that decides *when a knight appears* — precisely
what TASK.md §2.4 demands be proven by replay — lives in `view/` and is therefore
untestable, and the "replay e2e" degenerates into re-testing comps 3+4 while
comp 8's own behaviour stays unproven. With the port, the replay test drives the
**real** store, **real** driver and **real** orchestrator against a
`FakeSceneAdapter` that records calls, and asserts the §2.4 property directly.

Enforcement: a `dependency-cruiser` rule forbidding `three` (and DOM globals)
inside `runtime/`. A port that leaks a `THREE.Object3D` is worthless.

Cost accepted: one more interface to keep honest, and a documented deviation from
the six sibling components (recorded in `components/ar-scene/README.md`; no ADR).

### 4.2 The public factory

```ts
// runtime/tour-scene.ts
export interface TourSceneOptions {
  store: SlamAppStore; // read via selectors; dispatches setWaypointZone + markWaypointVisited
  assetProvider: AssetProvider; // D14 — injected, never in the store
  adapter: SceneAdapter; // view/three-scene-adapter in the app, FakeSceneAdapter in tests
  audioListener: THREE.AudioListener; // must already be running (A16)

  // seams (all defaulted in the app wiring, overridden in tests)
  driverFactory?: typeof createProximityDriver;

  // budgets — every one exported from config.ts, none inline (§8)
  modelLruCapacity?: number; // 3
  maxConcurrentParses?: number; // 2
  trailOrbPoolSize?: number; // 16
  trailWindowRadiusM?: number; // 15
  transcriptOffsetM?: number;

  autoRegisterFrameUpdate?: boolean; // default false (A21)
  onAudioBlocked?: () => void; // A16
}

export function createTourScene(options: TourSceneOptions): TourScene;

export interface TourScene {
  tick(dtSeconds: number): void; // yaw, orb window, driver.tick(), queue pump
  dispose(): void; // idempotent, ordered — §7
}
```

### 4.3 The `SceneAdapter` port

The single seam between orchestration and rendering. Deliberately handle-based:
`runtime/` never sees a `THREE` type.

```ts
// runtime/scene-adapter.ts   (types only — the implementation lives in view/)
export type WaypointHandle = { readonly _brand: 'waypoint' };
export type VisualHandle = { readonly _brand: 'visual' };
export type Vec3 = { x: number; y: number; z: number };

export interface SceneAdapter {
  // anchoring (A1) — the adapter calls createGpsAnchor; runtime just passes coords
  createWaypointRoot(id: string, coord: TourCoord): WaypointHandle;
  isAnchored(handle: WaypointHandle): boolean; // A19 — bootstrap gate
  getWorldPosition(handle: WaypointHandle): Vec3 | null;
  destroyWaypointRoot(handle: WaypointHandle): void;

  // visuals — build is async (fetch + parse), everything else is sync
  buildVisual(
    handle: WaypointHandle,
    kind: 'model' | 'sprite',
    url: string,
  ): Promise<VisualHandle>;
  buildFallbackVisual(handle: WaypointHandle): VisualHandle; // §7 degradation
  setVisible(visual: VisualHandle, visible: boolean): void;
  releaseVisual(visual: VisualHandle): void; // drop the clone (A10)

  // trail (A3)
  setOrbCoords(coords: readonly TourCoord[]): void; // ≤ pool size; adapter recycles

  // story (A13/A14)
  showTranscript(handle: WaypointHandle, text: string): void;
  hideTranscript(handle: WaypointHandle): void;
  playAudio(handle: WaypointHandle, url: string): void;
  stopAudio(): void;

  // world
  getUserPosition(): Vec3 | null;
  setPickTargets(handles: readonly WaypointHandle[]): void; // A12
  onTap(cb: (hit: { waypointId: string; role: string; uv?: [number, number] }) => void): () => void;

  dispose(): void;
}
```

The **template LRU** sits behind `buildVisual`/`releaseVisual` in the adapter for
the GPU part, but its **bookkeeping** (`core/model-cache.ts`) is pure and
injected — so eviction order, refcounting and the "evict → dispose + release"
rule are unit-testable with `T = string`.

### 4.4 Module list

```
components/ar-scene/
  core/                       pure — no THREE, no DOM
    zone-commands.ts          (prevZones, nextZones) → Command[]  (§2.3.8 helper)
    trail-window.ts           selectTrailWindow(...) + pool-slot assignment (A3/A4)
    visual-lifecycle.ts       per-waypoint generation state machine → intents (A6/A7)
    model-cache.ts            LRU + refcount, generic over an opaque handle (A9)
    parse-queue.ts            FIFO with concurrency cap, generic over () => Promise<T> (A8)
    story-session.ts          global single-story reducer: toggle / switch / stop (A13)
  runtime/                    orchestration — no THREE, no DOM
    tour-scene.ts             createTourScene: subscription, tick, dispose ordering
    waypoint-presenter.ts     per-waypoint state, holds handles not objects (A5)
    scene-adapter.ts          the port (types)
  view/                       THREE.js / DOM
    three-scene-adapter.ts    the one real adapter
    gltf-loading.ts           parseAsync from a Blob URL + SkeletonUtils.clone (A9)
    breadcrumb-orbs.ts        pooled orb meshes, setGpsPoint recycling (A3)
    ray-sources.ts            pointerRaySource / xrSelectRaySource (A11)
  demo.ts / index.html        desktop demo (§9)
  README.md
```

---

## 5. Lifecycle: zone edges → commands

Comp 4 writes `zones.byWaypointId` and guarantees **monotonic single-step**
transitions (D15). Comp 8 subscribes, diffs, and reacts to the **edges**:

| Edge                     | Command                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `IDLE → PREFETCHING`     | `getAssetUrl(visualAssetId)` → queue parse → `buildVisual` → keep `visible=false` |
| `PREFETCHING → ACTIVE`   | `setVisible(true)`; dispatch `markWaypointVisited` (A18); add to pick targets  |
| `ACTIVE → PREFETCHING`   | `setVisible(false)`; stop this waypoint's story if playing; hide transcript; **keep the model warm** |
| `PREFETCHING → IDLE`     | bump generation; `releaseVisual` (drop clone); `release()` model + audio ids; dispose transcript |

`core/zone-commands.ts` is the pure diff; `runtime/waypoint-presenter.ts` executes.

### 5.1 The async race (A6/A7)

```ts
// core/visual-lifecycle.ts — pure; returns intents, performs nothing
type Intent =
  | { kind: 'startLoad'; generation: number }
  | { kind: 'attach'; generation: number }
  | { kind: 'discard'; generation: number } // resolved late → dispose + release
  | { kind: 'show' }
  | { kind: 'hide' }
  | { kind: 'teardown' };
```

Rules pinned by unit test:

- `startLoad` captures `generation`. On resolve, `generation !== current` →
  `discard` (dispose the just-built visual, `release(id)`), never attach.
- Generation is bumped on every entry to `IDLE`, on `clearTour`, and on `dispose()`.
- Re-entering `PREFETCHING` while a load for the same generation is in flight is
  a no-op — no second `getAssetUrl`.
- `ACTIVE` may arrive **before** the load resolves (comp 4 only guarantees ≥1 tick,
  not "load finished"). Do not block: set `wantVisible = true` and let the attach
  step read it, so the knight pops in when it lands rather than never.
- `release()` runs only for a **resolved** `getAssetUrl` (A7).

### 5.2 The template LRU (A9)

`core/model-cache.ts` — pure, generic, injected `onEvict(handle)`:

- keyed by `AssetId`, capacity 3, classic LRU ordering;
- refcount per template (the same asset id can back two waypoints — the contract
  allows it);
- a template is freed **only** when refcount is 0 **and** it is evicted; the
  injected `onEvict` is what actually calls `geometry/material/texture.dispose()`
  and `assetProvider.release(id)` in the view layer;
- presenters hold `SkeletonUtils.clone`s (unconditional — plain `Object3D.clone()`
  breaks skinned/animated GLTFs, and knights plausibly animate);
- presenter teardown drops the clone and **never deep-disposes** (A10).

Documented assumption: capacity is a **count**, not a byte budget, because three.js
gives no cheap size figure. Tour models are assumed to be a few MB. This is the
first thing to revisit under field OOM.

---

## 6. Interaction, story and trail

**Ray production (A11).** One `RaySource` interface, two implementations.
`pointerRaySource` wraps the existing shared `pointer-tap-picker` + `tap-gate`
(≤5 px, ≤400 ms). `xrSelectRaySource` turns the session's `select` event and the
`XRInputSource` ray into a `Raycaster.set` — **no tap-gate**, because `select`
already *is* the tap.

**Pickability (A12).** Only ACTIVE visuals and a shown transcript's own controls
enter the target set. GLTF picking uses `intersectObjects(roots, true)` and then
walks `.parent` up to the stamped `WaypointUserData { waypointId, role }` — comp 1's
`userData` convention extended. That walk gets its own test; it is what silently
breaks when an artist ships a deeply nested model.

**Story session (A13).** `core/story-session.ts` is a reducer over
`{ playingWaypointId, paused }`: tap a different knight → stop current, start new;
tap the playing knight → toggle pause/resume via comp 1's existing transport
reducer (not a restart); waypoint leaves ACTIVE → stop (no fade) + hide transcript
+ log once.

**Transcript (A14/A15).** `createInWorldText` from comp 2, child of the waypoint
group at a fixed local offset **below** the visual, so the group's existing yaw
handles facing. Built lazily on first play, kept until IDLE. Manual prev/next
paging through comp 2's existing page state and `hitTest(uv)`. Fixed panel width
in meters (no distance scaling), high-contrast dark panel + light text, depth-test
on but drawn after the model so it neither z-fights nor floats through it.

**Audio (A16/A17).** Comp 1's `audio-player` reused wholesale (`PositionalAudio`,
refDistance 1 m, rolloff 1.5, max 40 m), fed a Blob URL from the provider instead
of a fixture URL. The `AudioListener` is injected and must already be running;
comp 8 checks `listener.context.state`, attempts exactly one `resume()`, and on
failure logs an error and calls `onAudioBlocked` so the app can re-show the gate.

**Trail (A3/A4).** `selectTrailWindow(breadcrumb, userPos, { maxOrbs, radiusM })`
returns the ≤16 nearest breadcrumb indices within 15 m, by **horizontal** distance
(D17 metric), plus a pool-slot assignment that minimises re-points between frames.
The view keeps a fixed pool of orb meshes, each with its own `GpsAnchor`, and
re-points them via `setGpsPoint()` + `markMovedExternally()`. Orbs pulse; the pulse
degrades to a static glow under `prefers-reduced-motion`.

Consequence accepted: orbs are near-field only — a knight begins prefetching at
25 m, well before its orbs appear at 15 m. The map (comp 7) covers the far view.

---

## 7. Teardown and degradation

### 7.1 `dispose()` — idempotent, ordered

1. stop audio
2. unsubscribe from the store
3. drain/cancel the parse queue and **bump every generation** (in-flight loads then
   self-discard and self-release on resolve — this is what makes disposal safe
   mid-parse)
4. dispose presenters (clones, transcripts, audio elements)
5. dispose LRU templates
6. `release()` every outstanding ref-count
7. `anchor.dispose()` per waypoint and per orb
8. detach the ray source
9. remove roots from `arWorldGroup`

**Headline invariant: after `dispose()`, outstanding asset-provider ref-counts are
zero.** Directly testable with a counting fake provider, including the mid-parse case.

**XR session end.** Comp 8 registers a framework session disposer **only** when it
self-registered its frame update (i.e. it is running inside a real session).
Otherwise `resetWebXRState()` would rip the scene out from under a replay host.

**Tour reload / `clearTour`.** Full rebuild (A22).

### 7.2 Degradation matrix

| Condition                       | Behaviour                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Anchor still in `bootstrap`     | Excluded from `getObjects()` → waypoint stays IDLE (A19). Nothing appears for ~7 s; comp 9 shows "locating…".      |
| Asset missing / corrupt / 404   | Soft-fail: log **once**, keep the anchor, keep proximity + progress, render a **procedural fallback marker** so the visitor is not staring at empty space. Retry only on the next `IDLE→PREFETCHING` edge (the provider already evicts failed loads). |
| No WebXR / desktop browser      | Comp 8 does not decide. It takes an injected scene/camera/ray source and behaves identically. Support probing and messaging are the app shell's job. |
| WebGL context loss              | Not recovered, but never corrupting: on `webglcontextlost`, invalidate all templates + clones, drop the LRU, let the next zone edge rebuild. Recovery is a future item. |
| Very large tour (200 waypoints) | No cap — silently truncating content is worse. Anchors are the cost driver; 200 is fine, 5000 is not. The orb pool already bounds the other axis. |
| Poor / degraded GPS             | Nothing special. D16 hysteresis + the driver's movement epsilon already absorb it; second-guessing accuracy here would duplicate framework logic. |

---

## 8. Non-functionals and config

- **Frame budget:** `tick(dt)` ≲2 ms on a mid-range Android at 30 waypoints + 16
  orbs. Enforced *algorithmically* (O(waypoints) yaw + O(pool) orbs, no allocation
  in `tick`, scratch arrays reused rather than rebuilt per frame) and asserted as
  such in tests. The wall-clock figure is measured once on the phone and recorded
  in the README — **not** asserted in CI, where it would be flaky.
- **Memory ceiling:** peak GPU ≈ `3 × largest model + orb pool + active clones`.
  The *bound* is the tested property (§10, e2e #4), not a byte figure.
- **Logging:** framework `log`, **one-shot-per-key** for repeating conditions (the
  pattern `wayfinding-hud` documents), cleared when the condition heals. Logged at:
  zone edge, build start/end, load failure, LRU eviction, context loss, audio
  blocked. **Nothing per frame.**
- **Config constants** (`config.ts`, alongside the contract's `HYSTERESIS_FRACTION`
  and radius defaults), all injectable through `createTourScene` so tests can set
  LRU cap 1 and prove eviction without building four models:

```ts
export const MODEL_LRU_CAPACITY = 3;
export const MAX_CONCURRENT_PARSES = 2;
export const TRAIL_ORB_POOL_SIZE = 16;
export const TRAIL_WINDOW_RADIUS_M = 15;
export const TRANSCRIPT_OFFSET_M = 0.9; // below the visual
```

`TRAIL_WINDOW_RADIUS_M` is the value most likely to need field tuning: too small
and orbs pop in underfoot, too large and the trail is noise.

---

## 9. Demo (A23)

`components/ar-scene/demo.ts` + `index.html`, run via `pnpm dev` — desktop only:

- plain Three scene + OrbitControls + shared `resize.ts` / `demo.css` (comps 1/2
  pattern) — **not** `initReplayScene` (framework-owned, single-instance module
  state that throws on a second init);
- user position driven from **comp 4's existing `demo-walk.json`** — no new track
  file, and it stays index-aligned with comp 7's `demo-track.json`;
- **identity anchor factory**: `demo-walk.json` is already world-space, so the demo
  places waypoints directly (same as comp 4's demo). Real `createGpsAnchor` wiring
  is covered by runtime unit tests with a mocked factory and proven for real on the
  phone at Goal-2 — `GpsAnchor` needs an alignment matrix and GPS zero ref that do
  not exist outside a session;
- `StaticAssetProvider` (D14d) over checked-in fixtures — no network, no zip;
- a one-line **audio unlock button** (not the full gate — that is comp 9);
- **invariant HUD**: per-waypoint zone, built/visible state, LRU occupancy, parse
  queue depth, total outstanding ref-counts — the §2 success criteria visible live,
  which makes the demo a diagnosis tool rather than a screenshot;
- **playback speed + scrub** so the interesting 20 s where a knight activates is
  reachable without waiting.

**Fixture assets — bought once, shared.** `public/tour-fixture/{knight.glb,
marker.png, story.mp3}` (matching the existing `public/billboard/` precedent),
referenced from `store/fixtures/sample-tour.json`. CC0, ≲1 MB total. Comp 10
(authoring) needs sample attachable assets and the Goal-2 e2e needs a real
`tour.zip` containing assets — the same files serve all three. The GLB should be
**skinned**, so the `SkeletonUtils` path is exercised in the demo too.

Explicitly out of the demo (Goal-2, already demoed elsewhere): loading a real tour
zip over the network (comp 6), and the 2D map (comp 7).

---

## 10. Test plan (three levels)

### Unit — `core/`, coverage-counted

Zone-command diffing; trail windowing + pool assignment; the lifecycle state
machine's race cases (**resolve-after-idle**, **active-before-load**,
**dispose-in-flight**, **re-enter-while-loading**); LRU eviction + refcount
(including the same asset id on two waypoints); parse-queue ordering under cap;
story-session exclusivity and same-knight toggle; `markWaypointVisited`
idempotence on loop-back.

### jsdom integration — `view/`, `GLTFLoader` + anchor factory mocked

Mirrors comp 7's Leaflet-mocked `tour-map.test.ts`. Real `THREE` objects, no WebGL
context. Covers: the **clone-not-deep-dispose** invariant (A10 — the one that
silently nukes shared templates), the `userData` parent-walk on a nested model,
`SkeletonUtils.clone` on a skinned asset, pickability excluding hidden/PREFETCHING
meshes, and orb pool recycling via `setGpsPoint`.

### Replay e2e — `runtime/`, real store + real driver + real orchestrator + `FakeSceneAdapter`

Fixture: `recordings/2026-06-22_16-06-59utc.zip` via `replayRecording`, with
waypoint anchors synthesized from the recorded path — exactly as comps 4 and 7 do.
Four properties, **all geometry-derived, none hand-tuned** (comp 4's bar):

1. **Ordering (anti-jank).** Every `buildVisual` completes before that waypoint's
   first `setVisible(true)`; no `setVisible(true)` without a completed build.
2. **Balance (no leaks).** After the walk + `dispose()`, every `buildVisual` is
   matched by a `releaseVisual`, and the counting fake provider reports ref-count
   **zero** — plus a variant that disposes mid-parse.
3. **Agreement with geometry.** The set of waypoints that ever became visible
   equals the set whose true minimum horizontal distance along the recorded path
   dropped below `activeRadius`.
4. **Bounded resources.** Concurrent built visuals ≤ `LRU cap + presenters in
   PREFETCHING/ACTIVE`; orbs ≤ pool size; concurrent parses ≤ 2.

Deliberately **not** tested (per §2.3.8, render is excluded from the coverage
target): pixels, real GPU memory, real WebXR `select`. Those are demo- and
phone-verified.

---

## 11. Open questions for the product-owner review

1. **"Visited" means _reached_, not _heard_ (A18).** A castle may well want to know
   whether visitors actually heard a story, not just walked past it. Changing this
   means a second flag (`heardWaypointIds`) and a contract change — flagged rather
   than decided.
2. **Fallback visual styling.** A procedural marker stands in for a failed asset
   (§7.2). What it should look like — obviously-broken vs. neutral placeholder — is
   a product call, not an engineering one.

## 12. Deferred (future iterations)

- WebGL context-loss **recovery** (vs. today's safe degradation).
- Byte-budgeted LRU instead of a count cap, if field OOM shows up.
- `heardWaypointIds` / tour-complete summary (§2.6).
- Upstream-PR candidates once stable: `core/trail-window.ts` and `core/model-cache.ts`
  are both GPS-free, THREE-free and generic — the same reusability argument that
  applies to comp 4.

## 13. Time estimation

| Iteration                  | Estimated done | Actual |
| -------------------------- | -------------- | ------ |
| Component 8 (full scope)   | _TBD with Maria_ | —      |
