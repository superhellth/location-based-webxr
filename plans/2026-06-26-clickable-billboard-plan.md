# 2026-06-26 — Component 1: Clickable Billboard Sprite with Audio (plan)

> Supersedes the rough `2026-06-22-PLAN.md`. Plan-First artifact (`TASK.md`
> §2.3.1): no production code is written until this plan has been iterated with
> an LLM critical reviewer and reviewed with the team.

## 1. Use case & problem

The first Goal-1 component of the location-based AR audio tour-guide lab. A
deliberate **warm-up** building block: a 2D image at a world position that
always yaws to face the user but stays upright (a _cylindrical_ billboard —
rotate around Y only, never tilt or roll), and plays an audio clip when
clicked/tapped. **No tour, no GPS, no Redux, no zip, no WebXR.**

It matters because it is the **seed of the later knight markers and the
tap-to-play story** (component 8 reuses this exact picking + billboard + audio
logic, swapping the textured plane for a GLTF model and the HTMLAudio for the
proximity-driven asset-provider). A plain `THREE.Sprite` fully faces the camera
on all axes and won't keep a fixed up-axis, so we use a **textured plane that we
yaw toward the camera ourselves**.

### Decisions taken (2026-06-26)

- **Placement:** a standalone self-contained package `GpsPlusSlamJs_BillboardDemo`
  (component code + demo + tests in one package). Most isolated; if the pure
  modules prove generic we later extract them into the framework's
  `src/visualization/` for an upstream PR (mirroring the reticle/compass-cube
  pattern).
- **Audio:** `HTMLAudioElement` (`new Audio(url)`) — non-spatial, simplest, easy
  to unit-test play/stop state. `THREE.PositionalAudio` deferred.

## 2. Goals, requirements, success criteria

### Functional requirements

- Render a 2D textured image at an arbitrary world `THREE.Vector3`.
- Billboard yaws around **Y only** to face the camera horizontally; **pitch and
  roll stay exactly 0** regardless of camera elevation.
- Click/tap starts the billboard's audio; it is `idle` until clicked and returns
  to `idle` when audio ends.
- **At most one** audio plays at a time — clicking B while A plays stops A.
- Multiple billboard instances coexist in one scene.

### Non-functional requirements

- Pure logic (math + state) is **framework-free and view-free**: no WebGL, no
  DOM, no Three.js needed to unit-test it (mirrors `hit-test-reticle.ts`, which
  unit-tests the view-model and leaves per-frame plumbing to app glue).
- Reusable in any Three.js project; no AR/GPS/Redux coupling.
- Passes the repo gate: Prettier, ESLint (no `any`, `eqeqeq`, complexity ≤10),
  strict TS (`noUncheckedIndexedAccess`), no dead code (knip), no cycles.

### Success criteria

1. Unit tests green for the pure yaw math: applying `(0, yaw, 0)` leaves
   `rotation.x === 0` and `rotation.z === 0`, and the plane's local +Z faces the
   camera in the XZ plane.
2. Unit tests green for the playback state machine: `click` → `playing`,
   `ended`/`stop` → `idle`; exclusive-playback resolver returns exactly the
   clicked id as playing.
3. Demo (`pnpm dev`) shows ≥3 billboards; orbiting the camera (incl. high pitch)
   keeps every billboard upright and front-facing; clicking one plays its sound
   and stops any other; clicking again after it ends replays it.
4. `pnpm test` (format + lint + typecheck + unit) passes in the package.
5. Sidecar `*.md` docs exist for each behavior file.

> **Replay e2e:** `TASK.md` requires replay e2e only _where a component depends
> on movement_. Component 1 has **no GPS/movement dependency**, so its proof is
> unit tests + the interactive demo. (The first replay-driven component is #4.)
> Recorded explicitly so the omission is a decision, not an oversight.

## 3. Architecture

Strict separation of **pure logic** (unit-tested) from **view layer** (demo /
integration), exactly like `hit-test-reticle.ts` splits the unit-tested core
from the per-frame XR plumbing.

```
GpsPlusSlamJs_BillboardDemo/
  package.json              # scripts mirror AnchorStarter (dev/test/test:unit/lint/...)
  vite.config.ts            # server.port: 5182
  tsconfig.json, tsconfig.vitest.json, config/{vitest,eslint,prettier}  # from AnchorStarter
  index.html                # <div id="canvas-root"> + module script
  src/
    billboard-math.ts          # PURE: computeBillboardYaw(...)                      (+ .md)
    billboard-math.test.ts
    playback-state.ts          # PURE: nextPlaybackState + resolveExclusivePlayback  (+ .md)
    playback-state.test.ts
    clickable-billboard.ts     # VIEW: textured-plane mesh factory + dispose         (+ .md)
    audio-player.ts            # VIEW: thin HTMLAudioElement wrapper                  (+ .md)
    billboard-interaction.ts   # VIEW: Raycaster pick -> dispatch click               (+ .md)
    main.ts                    # DEMO: scene + OrbitControls + render loop
```

### Pure module 1 — `billboard-math.ts`

Yaw a plane whose default facing is local **+Z** toward the camera, around Y only.

```ts
/** Yaw (radians) that turns a +Z-facing plane to face the camera in the XZ
 *  plane. Returns `fallback` when camera is directly above/below (degenerate). */
export function computeBillboardYaw(
  billboard: { readonly x: number; readonly z: number },
  camera: { readonly x: number; readonly z: number },
  fallback = 0,
): number {
  const dx = camera.x - billboard.x;
  const dz = camera.z - billboard.z;
  if (dx === 0 && dz === 0) return fallback; // camera straight overhead
  return Math.atan2(dx, dz); // pitch/roll intentionally untouched by the caller
}
```

View layer applies it as `mesh.rotation.set(0, computeBillboardYaw(...), 0)`
once per frame — so pitch/roll are provably never written.

### Pure module 2 — `playback-state.ts`

```ts
export type PlaybackState = "idle" | "playing";
export type PlaybackEvent = "click" | "ended" | "stop";

export function nextPlaybackState(s: PlaybackState, e: PlaybackEvent): PlaybackState {
  switch (e) {
    case "click":
      return "playing"; // v1: click always (re)starts
    case "ended":
    case "stop":
      return "idle";
  }
}

/** Single-audio policy: clicking `clickedId` makes it the only one playing. */
export function resolveExclusivePlayback(
  ids: readonly string[],
  clickedId: string,
): Readonly<Record<string, PlaybackState>> {
  return Object.fromEntries(ids.map((id) => [id, id === clickedId ? "playing" : "idle"]));
}
```

### View layer (demo-only, render not unit-tested)

- `clickable-billboard.ts`: `createClickableBillboard({ id, position, texture, audioUrl })`
  → `{ id, mesh, faceCamera(cameraPos), dispose() }`. `PlaneGeometry` +
  `MeshBasicMaterial({ map, transparent: true })`; `dispose()` follows the
  framework's `disposeObject3D` pattern (geometry/material/texture).
- `audio-player.ts`: wraps `new Audio(url)`; `play()` resets `currentTime` then
  plays, `stop()` pauses+resets, exposes `onended`.
- `billboard-interaction.ts`: one `THREE.Raycaster`; on `pointerdown` computes
  NDC, raycasts against the billboard meshes, calls back with the hit id.
- `main.ts`: plain `WebGLRenderer` + `PerspectiveCamera` + `OrbitControls`
  (`three/examples/jsm/controls/OrbitControls.js`); render loop calls
  `faceCamera(camera.position)` on each billboard, and routes interaction →
  `resolveExclusivePlayback` → `audioPlayer.play()/stop()`.

## 4. Test plan

**Unit (vitest, real `three` math where needed):**

- `billboard-math.test.ts`
  - camera `(10,5,10)`, billboard origin → applying `(0, yaw, 0)` yields zero
    x/z Euler components; +Z points toward camera in XZ.
  - cardinal directions (N/E/S/W) → expected yaw values.
  - degenerate camera straight overhead `(0,5,0)` → returns `fallback`.
- `playback-state.test.ts`
  - `idle --click--> playing`, `playing --ended--> idle`, `playing --stop--> idle`.
  - `resolveExclusivePlayback(['a','b','c'],'b')` → only `b` playing.

**Manual/interactive (demo):** the success-criteria #3 checklist run by hand in
the browser — the warm-up's stand-in for replay e2e (justified above).

Commands (inside the package dir):

```
pnpm dev           # Vite demo at :5182
pnpm test          # format + lint + typecheck + unit (the gate)
pnpm run test:unit # fast vitest loop
```

## 5. Open questions (iterate with an LLM reviewer)

1. **Plane default facing:** confirm geometry faces +Z so `atan2(dx,dz)` is the
   correct convention (vs. a +π offset). Pin with a math test, not by eye.
2. **Fixed world size vs. distance scaling:** v1 keeps a fixed world-size plane.
   Acceptable for the warm-up?
3. **Texture/audio loading failure:** soft-fail (skip that billboard, warn) to
   match the contract's reject-on-error philosophy — worth doing in v1?
4. **OrbitControls dependency:** `three/examples/jsm` in the demo only (not the
   component) — fine, or hand-roll a tiny orbit to keep deps minimal?
5. **Pointer vs. XR select:** v1 uses DOM `pointerdown` + Raycaster (desktop
   demo). Component 8 swaps in the WebXR `select` path — keep the pick callback
   signature identical so the swap is trivial.

## 6. Steps to execute (after plan iteration)

1. Scaffold `GpsPlusSlamJs_BillboardDemo` (copy configs from `GpsPlusSlamJs_AnchorStarter`);
   register in `pnpm-workspace.yaml`.
2. TDD the two pure modules (`billboard-math`, `playback-state`) + tests + sidecar `.md`s; commit.
3. Build the view layer + demo `main.ts` + `index.html`; commit.
4. Run the package gate, then verify the demo against success-criteria #3.
