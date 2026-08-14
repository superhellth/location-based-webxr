# 2026-08-14 — Goal-2 Composition, Part 1: Authoring mode (implementation plan)

## Context

Components 1–10 are individually built, tested, and demoed (TASK.md §2.3,
Goal 1). This plan is the first half of Goal 2 (§2.4): wire the approved
components together through the shared store into the app's **Authoring
mode**:

> Authoring mode: onboarding gate → authoring tools (drop/attach/record) →
> tour packaging + QR (component 5).

Viewing mode (cloud-loader → onboarding → proximity/AR scene/map) is a
**separate plan**, landing after this one — it is the heavier composition
(more components, the mandated composed-flow replay test asserting the right
knights appear, TASK.md §2.4) and TASK.md itself says to build/compose the AR
scene last. Splitting also means Authoring mode is demoable and reviewable on
its own, matching the "components first" lesson already applied to Goal 1.

No app entry point exists yet — `GpsPlusSlamJs_TourBuilder/src/` currently
holds only `components/` (ten isolated demos) and `store/` (the contract).
This plan adds the first real composition layer, `src/app/`.

## What this plan does NOT do

- Viewing mode itself (separate plan). `main.ts` **does** branch on
  `?tour=` presence (folding the shared bootstrap into this plan, decided in
  review) but the viewing branch is a placeholder screen only — no
  cloud-loader/proximity/AR-scene wiring here.
- Any change to an existing component's own `demo.ts`/`index.html`. Each
  component's standalone demo stays exactly as approved; `src/app/` is new,
  additive composition code that imports components' `core`/`view` modules,
  never the other way around.
- A throwaway prototype round — per established project convention, built
  directly.
- Wiring TourBuilder into the root `build:site` deployable bundle. This app
  is being built to actually run in the field, not as a throwaway — but
  publishing it is a separate, reserved-for-later pass (it touches root
  build scripts shared by every other package). This plan only changes
  TourBuilder's own `pnpm test`/`pnpm dev`.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| AC1 | New top-level `src/app/` dir (sibling to `components/`, `store/`), one Vite entry (`src/app/index.html` + `main.ts`). | Matches the existing "store lives at `src/` root, not under `components/`" precedent — composition is not itself a component. |
| AC2 | `src/app/mode.ts` exports pure `resolveAppMode(url: URL): 'authoring' \| 'viewing'` (`?tour=` presence, D13), unit-tested. `main.ts` branches on it now; the `'viewing'` branch renders a placeholder ("Viewing mode — lands next") until the second plan replaces it. | Bootstrap is trivial and shared by both modes — cheap to land correct once instead of twice. Building the branch now (rather than deferring `?tour=` handling entirely) was the explicit call in review. |
| AC3 | Authoring mode uses the **real** `createAuthoringStore()` (`src/store/authoring-store.ts`), not the hand-rolled `authoringReducer` dispatch loop `components/authoring/demo.ts` uses for its own standalone demo. | First production use of the RTK store in composition; the component demo's hand-rolled store was always a demo-only stand-in (its own README never claimed otherwise). |
| AC4 | Live GPS only (`createLiveGpsPositionSource()`) — **no** live/replay mode toggle in the composed app. | The live/replay switch in `components/authoring/demo.ts` is demo-only scaffolding for exercising the component without a phone; `mountAuthoringView`'s real props never depended on it (confirmed reading the demo — the toggle lives entirely in `demo.ts`, not in the view/session contracts). A real author always has a live device. |
| AC5 | Pack + QR is a **new, small, own-UI panel** (`src/app/authoring/pack-and-share-panel.ts` or similar) built from packaging's `core/` (`packTour`, `buildTourUrl`, `generateQr`) and `view/` (`downloadBlob`, `renderQrSvg`) functions — **not** a reuse of `components/packaging/demo.ts`'s textarea/file-picker UI. | Packaging's own README states the view/core split exists "so the AR/authoring app (component 10) can reuse `core/` with its own UI" — this is that reuse point, by design. |
| AC6 | `onComplete(audioContext)` from onboarding is accepted and then **unused** past the mode transition in authoring mode — no story playback happens while authoring. | Onboarding is documented as mandatory for *both* modes (component 9's own README); authoring mode has no audio-story trigger, so the unlocked context is simply not consumed here (viewing/AR-scene is the real consumer, via component 8's existing `THREE.AudioListener` wrap). |
| AC7 | A **composed-flow test** proves the wiring: mock the framework's four permission functions to auto-grant, mount the real onboarding gate → drive the real authoring session against the real Task 1 raw-GPS replay track (`components/authoring/demo-track.json`, already a fixture) → drop ≥1 waypoint, attach one fixture asset → export → real `packTour` → unzip the result and assert `validateTour` passes on the recovered `tour.json` and every entry is store-mode (no DEFLATE). | TASK.md §2.4 explicitly mandates this proof for viewing mode ("prove the whole composed flow the same deterministic way... this is the test that proves all the pieces are plugged together correctly, not just individually correct"); applying the same bar to authoring mode is a direct extension of that spirit, and it is the first real exercise of the components wired together rather than against fakes. |
| AC8 | No root-gate or `build:site` changes in this plan. | Reserved for a later, separate pass — see "What this plan does NOT do". |
| AC9 | No throwaway prototype round. | Established project convention — this is deployment-target work, not a prototype. |
| AC10 | **Durable draft persistence via direct `opfs-storage.ts` calls — NOT `OpfsStorageBackend`.** Redesigned mid-implementation (see note below): a small module (`restore-authoring-draft.ts`) calls the framework's low-level OPFS primitives itself (`initOpfsStorage`, `createSession`, `writeAction`, `listSessions`, `getSessionsRootHandle`, `setSessionHandles`) to write only `authoring/*` actions and replay them back, entirely bypassing `OpfsStorageBackend`/`createAuthoringStore`'s `storageBackend` option and the framework's `recording` slice + persistence middleware. | A real author walks a route for 10–30+ min; RAM-only state (the store README: "no rehydration path") means a crash/reload loses the whole walk. Repo has **zero** IndexedDB precedent, so OPFS is still the right storage tech (established, tested via RecorderApp, matches the Chrome/Android target). **But** `OpfsStorageBackend` only writes while `state.recording.isRecording` is true — turning that on would require dispatching the framework's `startSession`/`endSession` (recording-slice), which would ALSO start persisting unrelated whitelisted framework actions (e.g. raw `gpsData` GPS-fix events) for the whole session, a telemetry side effect with no relation to "keep my waypoint draft safe" that was not part of the original ask. Calling the same low-level primitives `OpfsStorageBackend` itself calls, but scoped to only `authoring/*` actions, gets the identical on-disk durability with zero side effects on unrelated data. Discussed and confirmed in review before implementing. |
| AC11 | **Screen Wake Lock** during an active authoring session (`navigator.wakeLock.request('screen')` on session start, released on export/teardown; re-requested on `visibilitychange` back to visible, since the OS releases the lock when the tab is hidden). Feature-detected, non-fatal no-op when unsupported. | The phone screen sleeping mid-walk stalls the live GPS position source silently — a real field-failure mode, not polish. No repo precedent to reuse; new, small module. |
| AC12 | **`beforeunload` guard** while the draft has ≥1 waypoint or breadcrumb point and hasn't been exported yet. | Cheap, immediate mitigation for the same data-loss risk AC10 solves more fully — belongs even before AC10 lands. Mirrors the *idiom* already used in `GpsPlusSlamJs_RecorderApp/src/ui/navigation.ts` (`enable`/`disableBeforeUnloadWarning`) — reimplemented as a small TourBuilder-local module rather than imported, since apps don't depend on each other's app-level code (only on the shared framework). |
| AC13 | **Explicit error/status states** carried into the composed screens, not left implicit: the GPS-waiting status text (same pattern as `components/authoring/demo.ts`'s `statusEl`) while `createLiveGpsPositionSource()` hasn't produced a fix yet; pasted-URL validation before `buildTourUrl`/`generateQr` (catch a malformed `new URL()`, show inline, don't crash the panel); pack failure surfaced inline via the same `PackagingError` handling the component demo already does. | Production-grade composition needs these states designed, not discovered live during a real author's outdoor session. |
| AC14 | The composed-flow test (AC7) gets a **negative-path case**: one of the two mocked permission functions resolves denied → Start stays disabled → the authoring-tools screen is never mounted (asserted by absence, e.g. no waypoint-drop control in the DOM). | A deployment-grade composed-flow gate should prove the gate actually gates, not just the happy path. |

---

## Architecture

### `src/app/mode.ts` — pure

```ts
export type AppMode = 'authoring' | 'viewing';

/** Pure. `?tour=` presence decides the mode (contract D13). */
export function resolveAppMode(url: URL): AppMode {
  return url.searchParams.has('tour') ? 'viewing' : 'authoring';
}
```

### `src/app/main.ts` — the entry

```ts
import { resolveAppMode } from './mode.js';
import { mountAuthoringApp } from './authoring/authoring-app.js';
import { mountViewingPlaceholder } from './viewing-placeholder.js';

const root = document.getElementById('app-root')!;
const mode = resolveAppMode(new URL(location.href));

if (mode === 'authoring') {
  mountAuthoringApp(root);
} else {
  mountViewingPlaceholder(root); // replaced by the Viewing-mode plan
}
```

### `src/app/authoring/authoring-app.ts` — the composed flow

Four sequential screens in one root element, one mounted at a time
(mirrors the mount/`destroy()` pattern every component's own view already
uses) — a restore prompt now sits between onboarding and the tools screen:

```
mountOnboardingGate(root, { ...real permission fns, createAudioContext, onComplete })
  → onComplete(audioContext): destroy gate, check for a resumable draft (AC10)

store = createAuthoringStore({ storageBackend: new OpfsStorageBackend() })
findResumableDraft() → session dir found?
  yes → mountResumePrompt(root, { onResume, onDiscard })
          onResume:  restoreAuthoringDraft(store) (replays authoring/* actions), then ↓
          onDiscard: clearAuthoring(), starts a fresh OPFS session, then ↓
  no  → starts a fresh OPFS session, then ↓

mountAuthoringView(root, { session, subscribe, getState, dispatch, onExport })
  session = createAuthoringSession({
    positionSource: createLiveGpsPositionSource(),
    dispatch: store.dispatch,
    getState: store.getState,
    filesAssetProvider: createFilesAssetProvider(),
  })
  enableBeforeUnloadWarning() (AC12) while the draft is non-empty and unexported
  requestWakeLock() (AC11), re-requested on visibilitychange → visible
  // map (component 7) composed read-only, same wiring as components/authoring/demo.ts
  onExport(result):
    disableBeforeUnloadWarning(); releaseWakeLock()
    destroy authoring view, mount pack-and-share panel with result

mountPackAndSharePanel(root, { tour: result.tour, assetFiles: result.assetFiles })
  "Pack tour" → packTour(tour, assetFiles) → downloadBlob(blob, "tour.zip")
  "Generate QR" (author pastes the URL they uploaded the zip to)
    → validate as a URL first (AC13); on success:
      buildTourUrl(appBaseUrl, pastedUrl) → generateQr(url) → renderQrSvg(host, svg)
    → on failure: inline error, panel stays usable
```

No new Redux slice — `authoring` (already in the contract) is the only state
this screen touches; the screen-sequencing itself is local view state in
`authoring-app.ts`, same as how `components/onboarding/demo.ts` already hands
off to whatever comes next via a plain callback.

### `src/app/authoring/restore-authoring-draft.ts` (AC10 — redesigned, see decision note above)

No `OpfsStorageBackend`, no `recording` slice, no persistence middleware.
Calls the framework's plain `opfs-storage.ts` functions directly (the same
ones `OpfsStorageBackend` itself delegates to), scoped to `authoring/*`:

```ts
export interface ActionLike { readonly type: string; readonly [key: string]: unknown; }

export interface DurableAuthoringSession {
  readonly sessionName: string; // "" when OPFS is unsupported (no-op session)
  wrapDispatch<A extends ActionLike>(dispatch: (action: A) => unknown): (action: A) => unknown;
  flush(): Promise<void>;   // await every write enqueued so far
  discard(): Promise<void>; // delete this session's OPFS directory
}

/** Most recently created leftover session, if any. Never throws. */
export async function findResumableDraft(): Promise<string | null>;

/**
 * Reads a session's actions/*.json (1-based, zero-padded) in order and
 * dispatches only the `authoring/*` ones — reconstructing the draft exactly
 * as `ReplayEngine` reconstructs a recorder session, but reading straight
 * from OPFS instead of a zip, and through the PLAIN dispatch (not
 * `wrapDispatch`) so restored actions are never re-written under new indices.
 */
export async function restoreAuthoringDraft(
  dispatch: (action: ActionLike) => unknown,
  sessionName: string,
): Promise<void>;

/** Starts (or, given a prior session name, resumes/continues) durable
 *  writing. Resuming re-opens the existing session's handles via the
 *  framework's `setSessionHandles` and counts existing action files to
 *  continue the index — so a SECOND interruption after a resume can still
 *  replay the full history, not just what happened since resuming. */
export async function beginDurableAuthoringSession(
  existingSessionName?: string,
): Promise<DurableAuthoringSession>;

export async function discardDraft(sessionName: string): Promise<void>;
```

`opfs-storage.ts` exports `writeAction`/`listSessions` but no "read actions
back" function — reading is genuinely new code, reusing the same
`actions/000001.json`, … directory convention the write side already
produces. Writes are fire-and-forget per dispatch (mirrors the framework's
own async `WriteQueue`); `flush()` is the escape hatch for a caller (tests,
or a critical transition like export) that needs every write to have landed
first.

### `src/app/authoring/wake-lock.ts` (AC11) / `src/app/authoring/unload-guard.ts` (AC12)

Small, framework-free browser wrappers, no existing shared module to import
(wake lock has no repo precedent; the unload guard reimplements the
`enable`/`disableBeforeUnloadWarning` idiom `GpsPlusSlamJs_RecorderApp`
already uses, since apps don't import each other's app code):

```ts
export function requestWakeLock(): { release(): void };   // no-op release() if unsupported
export function enableBeforeUnloadWarning(shouldWarn: () => boolean): void;
export function disableBeforeUnloadWarning(): void;
```

### `src/app/viewing-placeholder.ts`

A single static message ("Viewing mode composition lands next") — no store,
no components composed. Deleted/replaced wholesale by the Viewing-mode plan.

---

## Testing

### `src/app/mode.test.ts`

- `?tour=` present (any value, including empty string) → `'viewing'`.
- No `?tour=` param, or an unrelated query string → `'authoring'`.
- Malformed/relative input is the caller's problem — `resolveAppMode` only
  ever receives a `URL` already constructed from `location.href`.

### `src/app/authoring/authoring-app.test.ts` — the composed-flow test (AC7)

`@vitest-environment jsdom`. Mocks only the framework's four permission
functions (`checkCameraPermission`, `checkGeolocationPermission`,
`requestCameraPermission`, `requestGeolocationPermission`) to resolve
granted, and `createAudioContext` to a `{ resume: () => Promise.resolve(),
state: 'running' }` stub (no real Web Audio in Node, same pattern
`onboarding-view.test.ts` already uses). Everything else — the real
`createAuthoringStore`, the real `authoringReducer`, the real
`createAuthoringSession`, the real `packTour` — runs unmocked.

1. Mount `authoring-app.ts`; click Grant Access, then Start.
2. Feed `components/authoring/demo-track.json` samples through the session's
   position source (same mechanic as the component's own
   `authoring-session-replay.e2e.test.ts`).
3. Drop a waypoint; attach one fixture `File` as its sprite/audio asset.
4. Export; assert the panel receives a `Tour` that passes `validateTour`.
5. Pack; unzip the resulting `Blob` and assert: `tour.json` round-trips
   through `validateTour`, every asset referenced by the waypoint is present
   at its declared `filename`, and every ZIP entry (local header + central
   directory) is stored, not deflated (reusing the raw-byte check style from
   `pack-tour.test.ts`).
6. **AC14 negative path:** rerun from step 1 with `requestGeolocationPermission`
   mocked to resolve denied — assert Start stays disabled and the
   authoring-tools screen never mounts (no waypoint-drop control present).

### `src/app/authoring/restore-authoring-draft.test.ts` (AC10)

Against a mocked OPFS handle (same `MockOPFSDirectoryHandle` fixture style
`opfs-storage.test.ts` already uses): no prior session → `findResumableDraft`
returns `null`; a prior session with `authoring/*` + unrelated actions
interleaved → `restoreAuthoringDraft` reconstructs the exact same
`AuthoringSliceState` a live session that dispatched only those actions would
have (non-`authoring/*` actions are skipped, not just harmless — asserted
directly). Discard path clears the found session's association without
touching the OPFS files (export/GC is a later concern).

### `src/app/authoring/wake-lock.test.ts` / `unload-guard.test.ts` (AC11/AC12)

Mocked `navigator.wakeLock` / `window.addEventListener`: request-on-call,
release-on-teardown, re-request on `visibilitychange`→visible, and a
no-op (not a throw) when `navigator.wakeLock` is undefined. Unload guard:
`beforeunload` only calls `preventDefault`/sets `returnValue` while
`shouldWarn()` is true at fire time (not just at registration time, since the
draft's empty/exported state changes over the session); idempotent
enable/disable, mirroring the assertions `navigation.test.ts` already makes
for the same idiom.

### Vite / tooling

- `vite.config.ts`: add `app: resolve(__dirname, "src/app/index.html")` to
  `build.rollupOptions.input`; add a card to the root `index.html` gallery
  linking to `src/app/`.
- `config/.dependency-cruiser.cjs`: add `^src/app` to `includeOnly`, plus a
  new forbidden rule mirroring `store-not-to-components` —
  `components-and-store-not-to-app` (neither `src/components/` nor
  `src/store/` may import from `src/app/`; dependencies flow
  `app → components`/`app → store` only, never back).
- `check:cycles` (`dpdm` target list in `package.json`): add
  `./src/app/main.ts` alongside the existing `./src/components/*/demo.ts`
  glob.
- New dir `src/app/` needs the same sanity pass every new component dir has
  needed: confirm it's inside `format`/`jscpd`/tsconfig `include` globs.

---

## Next steps

1. Iterate this plan with an LLM as critical reviewer; commit meaningful
   revisions.
2. `src/app/mode.ts` + its unit test first (pure, fastest feedback).
3. `src/app/authoring/authoring-app.ts` wiring onboarding → authoring tools
   (no persistence/wake-lock/unload-guard yet), manually verified via
   `pnpm dev` (real browser permission prompts, real live GPS) before the
   pack-and-share panel exists.
4. Pack-and-share panel (AC5), verified by hand: pack → inspect the zip →
   paste a real hosted URL → scan the QR.
5. `wake-lock.ts` / `unload-guard.ts` (AC11/AC12) + their unit tests — small,
   independent, wire into `authoring-app.ts`.
6. `restore-authoring-draft.ts` (AC10): swap in `OpfsStorageBackend`, build
   `findResumableDraft`/`restoreAuthoringDraft`, the resume-prompt screen,
   and their unit tests — the largest single addition, do it last among the
   composition code so the rest of the flow is already solid underneath it.
7. Error/status states (AC13) across the screens already built.
8. The composed-flow test (AC7) including the AC14 negative path.
9. `vite.config.ts` + dependency-cruiser + dpdm wiring (tooling notes above).
10. `viewing-placeholder.ts` + the `main.ts` branch (AC2).
11. Sidecar `README.md` for `src/app/` (TourBuilder's per-directory-README
    convention).
