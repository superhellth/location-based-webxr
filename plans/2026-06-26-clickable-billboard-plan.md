# 2026-06-26 — Component 1: Clickable Billboard Sprite with Audio + Transport Panel (plan, rev. 2)

> Supersedes the rough `2026-06-22-PLAN.md`. Plan-First artifact (`TASK.md`
> §2.3.1). Rev. 2 is the result of an LLM critical-review round: it consolidates
> the playback model into a single source of truth and adds an in-world
> transport panel (play/stop + seekable progress bar).

## 1. Use case & problem

First Goal-1 component of the location-based AR audio tour-guide lab. A
deliberate **warm-up** building block with **no tour, no GPS, no Redux, no zip,
no WebXR**: a 2D image at a world position that always yaws to face the user but
stays upright (a _cylindrical_ billboard — rotate around Y only, never tilt or
roll), plays an audio clip when clicked, and shows an in-world transport panel
to control playback.

It matters because it is the **seed of the later knight markers and the
tap-to-play story** (component 8 reuses this picking + billboard + audio +
panel logic, swapping the textured plane for a GLTF model and the HTMLAudio for
the proximity-driven asset-provider). A plain `THREE.Sprite` fully faces the
camera on all axes and won't keep a fixed up-axis, so we use a **textured plane
that we yaw toward the camera ourselves**.

### Decisions locked (review round, 2026-06-26)
- **Single transport model** (not two parallel functions): one pure reducer over
  `{ activeId, status, positionSec, durationSec }`. Fixes the stale-`ended` race
  and feeds the progress bar. Directly reusable by component 8.
- **Tap-to-seek now, drag later.** Tap a point on the bar → seek to that
  fraction. One gesture, identical on desktop and immersive XR (no `pointermove`
  dependency). Continuous drag-scrub deferred (desktop-only enhancement).
- **Iteration-1 scope = full transport panel:** billboarded panel, play/stop
  button, live progress bar, tap-to-seek.
- **Panel rendering = `CanvasTexture` on a plane** that billboards to the user
  (XR-safe; the same technique component 2 will use). Not a DOM/CSS overlay
  (TASK §2.3.2: DOM overlays are unreliable in immersive XR).
- **Factory takes ready resources** (`THREE.Texture` + `HTMLAudioElement`); the
  demo's `main.ts` owns loading. Mirrors component 8's asset-provider handoff.
- **Demo assets = committed tiny placeholder PNG + MP3** under `public/`.
- **Boundary with component 2:** Component 1 owns the transport-panel _chrome_
  (button + bar); component 2 owns rich text/transcript rendering.
- **Placement:** standalone package `GpsPlusSlamJs_BillboardDemo`. Pure modules
  may later be extracted to the framework's `src/visualization/` for an upstream
  PR (mirroring the reticle/compass-cube pattern).
- **Audio:** `HTMLAudioElement` (`new Audio(url)`), non-spatial.
  `THREE.PositionalAudio` deferred.

## 2. Goals, requirements, success criteria

### Functional requirements
- 2D textured image at a world `THREE.Vector3`; yaws around **Y only** to face
  the user, pitch/roll exactly 0.
- Clicking the sprite (re)starts its audio from 0 and opens its transport panel.
- Transport panel hangs below the sprite, **billboards with it** (reuses the
  same yaw), and stays interactive as the camera moves.
- Panel **play/stop** button toggles play/pause; **progress bar** fills as audio
  plays; **tap on the bar** seeks to that fraction.
- **At most one** clip active at a time; clicking another sprite switches.

### Non-functional requirements
- Pure logic (yaw math, transport reducer, panel hit-mapping) is framework- and
  view-free — unit-testable with no WebGL/DOM (mirrors `hit-test-reticle.ts`,
  which unit-tests the view-model and leaves per-frame plumbing to app glue).
- Reusable in any Three.js project; no AR/GPS/Redux coupling.
- Passes the repo gate: Prettier, ESLint (no `any`, `eqeqeq`, complexity ≤10),
  strict TS (`noUncheckedIndexedAccess`), no dead code (knip), no cycles, jscpd.

### Success criteria
1. **Yaw math** test builds a real `THREE.Object3D`, applies `(0, yaw, 0)`, and
   asserts the transformed local **+Z** normal's horizontal component points at
   the camera (projected dot ≈ 1) and its Y component is 0.
2. **Transport reducer** tests: click switches+resets; click-same restarts;
   toggle flips play↔pause; seek sets `position = fraction*duration`; tick
   updates position/duration; `ended` on the active id → paused at end; a stale
   `ended` (id ≠ activeId) is ignored. Selectors `isPlaying`/`progressFraction`
   correct.
3. **Panel hit-mapping** tests: a hit in the button rect → `{type:'toggle'}`; a
   hit in the track rect → `{type:'seek', fraction}` (correct value + clamped at
   both edges); a hit outside both → `null`.
4. Demo (`pnpm dev`): ≥3 billboards; orbiting (incl. high pitch) keeps sprite +
   panel upright and front-facing; clicking one plays + opens its panel and
   stops/closes any other; the button pauses/resumes; the bar fills; tapping the
   bar jumps the playhead.
5. `pnpm test` (format + lint + typecheck + unit) green; sidecar `*.md` exists
   for each behavior file.

> **Replay e2e** is intentionally out of scope: `TASK.md` requires it only for
> _movement-dependent_ components (the first is #4). Proof here = unit tests +
> the interactive demo. Recorded explicitly so the omission is a decision.

## 3. Architecture

Three pure modules + a thin view layer, wired by the demo, exactly like
`hit-test-reticle.ts` splits the unit-tested core from the per-frame plumbing.
Plain in-memory transport state (no Redux — spec says none for this component);
a single `dispatch(action)` runs the reducer then applies audio/panel effects.

```
GpsPlusSlamJs_BillboardDemo/
  package.json  vite.config.ts (server.port 5182)
  tsconfig.json  tsconfig.vitest.json  config/{vitest,eslint,prettier}   # from AnchorStarter
  public/        # tiny placeholder PNG(s) + MP3(s)
  index.html     # <div id="canvas-root"> + module script
  src/
    billboard-math.ts        # PURE: computeBillboardYaw(...)                          (+ .md)
    billboard-math.test.ts
    playback-transport.ts    # PURE: transportReducer + selectors                     (+ .md)
    playback-transport.test.ts
    panel-layout.ts          # PURE: DEFAULT_PANEL_LAYOUT + hitToIntent(uv,layout)     (+ .md)
    panel-layout.test.ts
    clickable-billboard.ts   # VIEW: sprite plane + panel group + faceCamera + dispose (+ .md)
    transport-panel-view.ts  # VIEW: CanvasTexture UI (button/track/fill) + redraw     (+ .md)
    audio-player.ts          # VIEW: wraps the injected HTMLAudioElement               (+ .md)
    billboard-interaction.ts # VIEW: Raycaster -> sprite click | panel uv -> hitToIntent (+ .md)
    main.ts                  # DEMO: scene + OrbitControls + dispatch + render loop
```

### Pure 1 — `billboard-math.ts` (shared by sprite AND panel)
```ts
/** Yaw (rad) turning a +Z-facing plane to face the camera in the XZ plane.
 *  Returns `fallback` when the camera is directly overhead (degenerate). */
export function computeBillboardYaw(
  billboard: { readonly x: number; readonly z: number },
  camera: { readonly x: number; readonly z: number },
  fallback = 0,
): number {
  const dx = camera.x - billboard.x;
  const dz = camera.z - billboard.z;
  if (dx === 0 && dz === 0) return fallback;
  return Math.atan2(dx, dz);
}
```
View applies `mesh.rotation.set(0, yaw, 0)` so pitch/roll are never written.
Convention pinned in the sidecar: **+Z is the image/front face**.

### Pure 2 — `playback-transport.ts` (single source of truth)
```ts
export type PlaybackStatus = 'playing' | 'paused';
export interface TransportState {
  readonly activeId: string | null;   // open panel / loaded clip
  readonly status: PlaybackStatus;
  readonly positionSec: number;
  readonly durationSec: number;        // 0 until known
}
export type TransportAction =
  | { type: 'click'; id: string }                                  // sprite tapped
  | { type: 'toggle' }                                             // play/stop button
  | { type: 'seek'; fraction: number }                            // tap-to-seek (0..1)
  | { type: 'tick'; positionSec: number; durationSec: number }    // audio timeupdate
  | { type: 'ended'; id: string };                                // audio ended

export const INITIAL: TransportState = { activeId: null, status: 'paused', positionSec: 0, durationSec: 0 };
export function transportReducer(s: TransportState, a: TransportAction): TransportState;
export function isActive(s: TransportState, id: string): boolean;
export function isPlaying(s: TransportState, id: string): boolean;     // active && playing
export function progressFraction(s: TransportState): number;          // pos/dur clamped 0..1
```
Semantics: `click` always (re)starts (`activeId=id, status='playing',
position=0`); `toggle` flips play↔pause; `seek` sets `position=fraction*duration`;
`ended` on the active id → `paused` at `position=duration`; **stale `ended`
(id ≠ activeId) ignored**.

### Pure 3 — `panel-layout.ts`
```ts
interface Rect { x: number; y: number; w: number; h: number; }  // normalized UV [0..1]
export interface PanelLayout { button: Rect; track: Rect; }
export const DEFAULT_PANEL_LAYOUT: PanelLayout;
export type PanelIntent = { type: 'toggle' } | { type: 'seek'; fraction: number } | null;
/** Map a panel-local hit (u,v in [0..1]) to an intent. */
export function hitToIntent(uv: { u: number; v: number }, layout?: PanelLayout): PanelIntent;
```
`seek` fraction = `clamp01((u - track.x) / track.w)`.

### View layer (demo-only; render excluded from coverage)
- `clickable-billboard.ts`: `createClickableBillboard({ id, position, texture, audio })`
  → `{ id, group, spriteMesh, panel, faceCamera(camPos), dispose() }`. Sprite =
  `PlaneGeometry` + `MeshBasicMaterial({ map: texture, transparent: true })`
  (front +Z). `faceCamera` yaws sprite + panel via `computeBillboardYaw`.
  `dispose()` = `disposeObject3D(group)` (framework util) **plus**
  `audio.pause(); audio.src = ''`.
- `transport-panel-view.ts`: draws button glyph (play ▶ / stop ■) + track + fill
  to a canvas → `THREE.CanvasTexture` → plane positioned below the sprite;
  `redraw(state)` updates the fill from `progressFraction` and the glyph from
  `status`; visible only when `isActive(id)`.
- `audio-player.ts`: wraps the injected `HTMLAudioElement`; `play/pause/seekTo`;
  emits `tick` (`timeupdate`), `ended`, and reads duration (`loadedmetadata`).
- `billboard-interaction.ts`: one `THREE.Raycaster`; on a *click* (see drag
  guard) raycasts the sprite planes + the visible panel plane. Sprite hit →
  `{click,id}`; panel hit → use `intersection.uv` → `hitToIntent` →
  `toggle`/`seek`. The ray-production seam is all that changes for component 8's
  XR `select`.
- `main.ts`: scene + `OrbitControls` (`three/examples/jsm/controls/OrbitControls.js`);
  3 billboards; `dispatch(action)` runs `transportReducer` then reconciles side
  effects (active audio play/pause/seek, panel visibility); render loop calls
  `faceCamera` on each + `redraw` on the active panel.

## 4. Test plan

**Unit (vitest, real `three` math where needed):**
- `billboard-math.test.ts` — transformed +Z normal points at camera horizontally
  (Y component 0); cardinal directions (N/E/S/W) → expected yaw; degenerate
  camera straight overhead → `fallback`.
- `playback-transport.test.ts` — all transitions + stale-`ended` ignored +
  selectors `isPlaying`/`progressFraction`.
- `panel-layout.test.ts` — button rect → toggle; track rect → seek fraction
  (incl. clamp at both edges); outside → null.

**Manual/interactive (demo):** success-criterion #4 checklist — the warm-up's
stand-in for replay e2e (justified above).

Commands (inside the package dir):
```
pnpm dev           # Vite demo at :5182
pnpm test          # format + lint + typecheck + unit (the gate)
pnpm run test:unit # fast vitest loop
```

## 5. Remaining minor open questions (decide during build)
1. **Click-vs-orbit-drag guard:** treat a pointer as a click only if up-down
   moved < ~5px within < ~300ms (OrbitControls also owns drag). Tune in the demo.
2. **Panel size/offset in meters** (e.g. ~0.5 m wide, centered ~0.4 m below the
   sprite).
3. **Button glyph:** simple canvas-drawn triangle/square; no icon font.
4. **Tick source:** `timeupdate` (~4 Hz) is enough for the bar; could rAF-drive
   for smoothness later.
5. **`ended` playhead:** leave the bar full (`position=duration`), status paused;
   a sprite click restarts from 0.

## 6. Steps to execute (after plan iteration)
1. Scaffold `GpsPlusSlamJs_BillboardDemo` (copy configs from
   `GpsPlusSlamJs_AnchorStarter`); register in `pnpm-workspace.yaml`; add
   placeholder assets under `public/`.
2. TDD the 3 pure modules (`billboard-math`, `playback-transport`,
   `panel-layout`) + tests + sidecar `.md`s; commit.
3. Build the view layer + panel + demo `main.ts`/`index.html`; commit.
4. Run the package gate, then verify against success-criterion #4.
