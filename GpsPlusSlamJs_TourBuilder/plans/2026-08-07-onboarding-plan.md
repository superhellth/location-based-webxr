# 2026-08-07 — Component 9: Onboarding Permissions Gate + Audio Unlock (implementation plan)

## Context

Component 9 is the mandatory first screen of both app modes (TASK.md §2.4:
Authoring starts `onboarding gate → authoring tools`; Viewing starts
`cloud-storage load → onboarding gate → AR scene`). Its job, per TASK.md §2.3:

> a mandatory checklist for camera and GPS access (unchecking shows a red
> explanation; both required to enable Start), where the click on Start is
> also the user gesture that unlocks the Web Audio API so audio can play
> later. This protects against permanent browser-level permission denials.

Two concerns, one screen:

1. **Permissions checklist** — camera + GPS, driven by *real* granted/denied
   status read from the browser, never a self-ticked checkbox. Start stays
   disabled until both report granted.
2. **Audio unlock** — the Start click is the user gesture (Web Audio autoplay
   policy) that resumes an `AudioContext`, so playback works later without a
   second gesture. Component 8 (`ar-scene`) already documents this hand-off:
   it receives an **already-running** `AudioListener` and never unlocks audio
   itself (plan `2026-07-31-ar-scene-plan.md`, decision A16).

Not this component's job: WebXR session support/probing (framework's
`webxr-session.ts` / `webxr-support-probe.ts`, used later when actually
entering AR), constructing the `THREE.AudioListener` (Goal-2 composition
wraps the plain `AudioContext` this component unlocks), any store slice
(onboarding is **not** in the pinned §2.2 slice inventory — `Shared-Contract.md`
lists only `tour`, `tourProgress`, `zones`, `authoring`), no movement
dependency, so no replay e2e (TASK.md §2.3 only requires replay tests "where
the component depends on movement").

Package: **`GpsPlusSlamJs_TourBuilder/`**. Layout mirrors the billboard /
proximity `core` + `view` split; directory `components/onboarding/`.

---

## Reuse: the framework already owns permission requests

`GpsPlusSlamJs_AppFramework/src/sensors/permission-checker.ts` already
implements tested, prompting and non-prompting permission helpers. Component
9 **must** call these rather than touching `getUserMedia`/`geolocation`
directly — duplicating them would violate the one-way framework→app layering
in `CLAUDE.md` for no benefit (RecorderApp already builds its own permission
UI, `src/main.ts` `handleRequestPermissions`, on the same helpers).

```ts
// exact shape already in the framework — Component 9's view/adapter maps this
// into the core's own PermissionState, it is not re-typed at the core level.
interface PermissionStatus {
  supported: boolean;
  granted: boolean | null;
  error?: string; // already user-facing, e.g. "Camera access denied. Please
                   // enable in browser settings." — Component 9 reuses this
                   // string verbatim instead of maintaining its own copy.
}

checkCameraPermission(): Promise<PermissionStatus>;       // non-prompting (Permissions API query)
checkGeolocationPermission(): Promise<PermissionStatus>;  // non-prompting
requestCameraPermission(): Promise<PermissionStatus>;     // prompts via getUserMedia, stops tracks
requestGeolocationPermission(timeoutMs?): Promise<PermissionStatus>; // prompts via getCurrentPosition
```

No existing onboarding-gate or audio-unlock code exists anywhere else in the
repo (confirmed by search) — this is new work, not a duplicate.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| O1 | **Real permission state only — never a user-ticked checkbox.** Start is only enabled when both `camera` and `gps` core state equal `'granted'`, as reported by the framework. | Literal spec requirement; confirmed explicitly in review — the whole point is the browser's own answer gates Start, not user self-report. |
| O2 | **Plain `AudioContext`, not `THREE.AudioListener`.** Component 9 stays framework/Three-free like components 3/4. | Matches its own spec description (no tour/GPS/AR dependency); Goal-2 composition does the trivial `listener.context = ctx` wrap when handing off to comp 8. |
| O3 | **Sequential permission requests, not parallel.** Grant Access requests camera, awaits the result, then requests GPS. | Mirrors RecorderApp's existing `requestAllPermissions()` precedent of deliberately ordering camera/orientation/geolocation; avoids stacking two native permission dialogs at once, which is jarring and inconsistent across mobile browsers. |
| O4 | **Check-then-request.** On mount, call the non-prompting `checkCameraPermission()`/`checkGeolocationPermission()` first; only the explicit "Grant Access" click calls the prompting `request*Permission()` pair. | A returning visitor who already granted both in an earlier session sees Start already enabled — no needless reprompt. Cheap: reuses framework functions already written for exactly this. |
| O5 | **Single "Grant Access" button, not per-item buttons or auto-prompt-on-load.** | Decided in review: one deliberate gesture drives both requests (sequenced per O3); avoids two unsolicited native prompts firing on page load. |
| O6 | **Core owns no message copy.** `explanationFor(state, kind)` returns whatever `error` string the adapter forwarded from the framework's `PermissionStatus`, unmodified. | One source of truth for user-facing copy; avoids two places drifting out of sync. |
| O7 | **`resume()` is called synchronously as the first statement of the Start click handler**, before any `await`. | Web Audio autoplay policy requires the resume call itself to be inside the gesture's call stack; awaiting other work first can lose the gesture in some browsers. |
| O8 | **No live re-check via `subscribePermissionChanges`.** If denied, the user retries by clicking "Grant Access" again after fixing browser settings. | Out of written scope (TASK.md asks for a checklist + Start gate, not live cross-tab sync); documented as a §2.6-style future idea, not built now. |
| O9 | **No throwaway prototype round.** Per team convention this repo now builds the final component directly (skips TASK.md's generic "prototype in Gemini/OpenAI UI" step). | — |

---

## Architecture

### `core/permission-gate.ts` — pure, framework-free

```ts
export type PermissionState = 'unknown' | 'requesting' | 'granted' | 'denied';

export interface GateState {
  readonly camera: PermissionState;
  readonly gps: PermissionState;
  readonly cameraMessage?: string; // only meaningful when camera === 'denied'
  readonly gpsMessage?: string;    // only meaningful when gps === 'denied'
  readonly audioUnlocked: boolean;
}

export const initialGateState: GateState = {
  camera: 'unknown',
  gps: 'unknown',
  audioUnlocked: false,
};

export type GateAction =
  | { readonly type: 'grantAccessRequested' }
  | {
      readonly type: 'permissionResult';
      readonly kind: 'camera' | 'gps';
      readonly granted: boolean;
      readonly message?: string;
    }
  | { readonly type: 'audioUnlocked'; readonly unlocked: boolean };

/** Pure. Same (state, action) → same next state. */
export function gateReducer(state: GateState, action: GateAction): GateState;

// Selectors
export function canGrantAccess(state: GateState): boolean;   // neither item is 'requesting'
export function canStart(state: GateState): boolean;         // camera==='granted' && gps==='granted'
export function explanationFor(
  state: GateState,
  kind: 'camera' | 'gps',
): string | null;                                             // message iff that item is 'denied'
```

**`grantAccessRequested`** sets both `camera` and `gps` to `'requesting'` (O3
sequencing lives in the adapter — the core doesn't know or care about call
order, it just receives two independent `permissionResult` actions whenever
they arrive). **`permissionResult`** sets the named item to `'granted'` or
`'denied'` and stores `message` (only relevant on `'denied'`, per O6).
**`audioUnlocked`** only ever flips the flag — it never touches `camera`/`gps`.

### `view/onboarding-adapter.ts` — the impure browser-facing wrapper

```ts
export interface OnboardingAdapterDeps {
  readonly checkCameraPermission: () => Promise<PermissionStatus>;
  readonly checkGeolocationPermission: () => Promise<PermissionStatus>;
  readonly requestCameraPermission: () => Promise<PermissionStatus>;
  readonly requestGeolocationPermission: () => Promise<PermissionStatus>;
  readonly dispatch: (action: GateAction) => void;
}

/** O4: non-prompting check for both, on mount. */
export async function checkExistingPermissions(deps: OnboardingAdapterDeps): Promise<void>;

/** O3/O5: sequential prompting request pair, fired by the Grant Access click. */
export async function requestPermissions(deps: OnboardingAdapterDeps): Promise<void>;
```

Both functions map the framework's `PermissionStatus` (`granted: boolean |
null`, `error?`) onto `permissionResult` (`granted === true` → granted,
otherwise denied — `null`/unsupported folds into `denied` using the
framework's own unsupported-browser message, per O6). Real DI here is what
makes `view/onboarding-adapter.test.ts` mock the four framework calls and
assert both the O3 ordering and the state mapping without touching a real
browser API.

### `view/onboarding-view.ts` — DOM rendering + wiring, reusable

```ts
export interface OnboardingGateDeps extends OnboardingAdapterDeps {
  readonly createAudioContext: () => AudioContext; // injected, so tests never touch real Web Audio
  readonly onComplete: (audioContext: AudioContext) => void;
}

/** Mounts the checklist + Grant Access + Start UI into `root`. Reusable by
 *  Goal-2 composition for both Authoring and Viewing bootstrap, not just the
 *  demo. */
export function mountOnboardingGate(
  root: HTMLElement,
  deps: OnboardingGateDeps,
): { readonly destroy: () => void };
```

Renders two checklist rows (camera, GPS) each showing its `PermissionState`
and — when `'denied'` — the red `explanationFor` text; a "Grant Access"
button (disabled while `!canGrantAccess`); a "Start" button (disabled while
`!canStart`). On mount, calls `checkExistingPermissions`. Grant Access click
calls `requestPermissions`. Start click (O7): calls
`deps.createAudioContext().resume()` **synchronously first**, then on
resolution dispatches `audioUnlocked(ctx.state === 'running')` and — only
once `unlocked` is true — calls `deps.onComplete(ctx)`. `destroy()` removes
listeners and DOM nodes (same teardown contract as `view/tour-map.ts`).

### Config

None — no tunable constants (unlike comp 4's `HYSTERESIS_FRACTION`). The only
"config" is which framework functions get injected, and that's DI, not a
constant.

---

## Testing (unit only — no movement dependency, so no replay e2e)

### `core/permission-gate.test.ts` — pure reducer + selectors

- Initial state: both `'unknown'`, `canStart` false, `canGrantAccess` true,
  `explanationFor` null for both.
- `grantAccessRequested` → both `'requesting'`; `canGrantAccess` now false.
- `permissionResult` for one kind while the other is still `'requesting'` →
  `canStart` stays false; only the resolved kind's message/state updates.
- Both `permissionResult({ granted: true })` → `canStart` true.
- A `'denied'` result carries its `message` through to `explanationFor`
  unchanged (pins O6 — no core-invented copy).
- Denied → retried (`grantAccessRequested` again) → `'requesting'` clears the
  stale message until the new result arrives.
- `audioUnlocked` never mutates `camera`/`gps`; `canStart` is independent of
  `audioUnlocked` (Start being *enabled* and Start having been *clicked* are
  different facts — the reducer must not conflate them).

### `view/onboarding-adapter.test.ts` — mocked framework calls

- `checkExistingPermissions`: both framework check calls invoked once each;
  `granted: true` → `permissionResult({ granted: true })`; `granted: false`
  with `error` → `permissionResult({ granted: false, message: error })`;
  `granted: null` (unsupported) → also dispatched as `denied` carrying the
  framework's unsupported-browsermessage.
- `requestPermissions`: asserts **call order** — `requestCameraPermission`
  resolves before `requestGeolocationPermission` is invoked (pins O3, the
  actual behavior worth a test, since a `Promise.all` regression would still
  pass every other assertion).
- A rejected/thrown framework call doesn't leave the adapter's promise
  hanging — maps to a `denied` result rather than an uncaught rejection.

### `view/onboarding-view.test.ts` — DOM wiring, `@vitest-environment jsdom`

- Start button `disabled` attribute tracks `canStart` as mocked deps resolve.
- Denied row renders the red explanation text; granted row does not.
- Start click calls the injected `createAudioContext().resume` before
  `requestCameraPermission`/`requestGeolocationPermission` settle (order,
  not timing — proves O7 isn't accidentally deferred behind a prior await).
- `onComplete` fires exactly once, only after `audioUnlocked` is true, and is
  never called if `resume()`'s returned context stays `'suspended'`.
- `destroy()` removes the mounted DOM and stops further dispatches.

---

## Demo (`components/onboarding/`)

`demo.ts` + `index.html`, following the billboard/map boilerplate (`shared/demo.css`,
`#canvas-root`-equivalent plain DOM root, no canvas needed here — this
component has no Three.js scene). Wires `mountOnboardingGate` against the
**real** framework functions (`requestCameraPermission` et al.) — this is the
one place in the repo that exercises the real browser prompts end to end.
`onComplete` plays a short confirmation: a ~200 ms sine-wave beep built with
a plain `OscillatorNode` (no fixture asset needed — this is what the spec's
"a test beep plays" confirmation literally asks for) plus on-screen text
("Audio unlocked ✓"). A visible state log (current `GateState` as JSON) makes
the checklist's real-vs-denied transitions inspectable during the demo, same
spirit as component 4's HUD.

---

## Tooling notes

- New dir `components/onboarding/` — confirm inside the existing
  `format`/`jscpd`/`depcruise`/tsconfig `include` globs (same check every
  prior new component dir needed).
- `dependency-cruiser`: `core/` must not import `three` or DOM types at all
  (no type-only exception needed here, unlike comp 4's `Vector3`); `view/`
  imports the framework's `permission-checker` module — confirm that import
  path is allowed by the existing boundary rules (TourBuilder → framework is
  the expected direction, framework never imports back).
- `AudioContext`/`OscillatorNode` are browser globals — `view/` and `demo.ts`
  only, never `core/`.

---

## Next steps

1. Iterate this plan with an LLM as critical reviewer (a few rounds); commit
   each meaningful revision.
2. Build the real component directly (TDD, red → green → refactor) — no
   throwaway prototype round (O9).
3. `core/permission-gate.ts` + its unit tests first (pure, fastest feedback).
4. `view/onboarding-adapter.ts` against mocked framework calls.
5. `view/onboarding-view.ts` DOM wiring + its jsdom tests.
6. `demo.ts` + `index.html`, verified against real browser permission
   prompts.
7. Sidecar `README.md` per directory (TourBuilder's per-directory-README
   convention, `docs/adr/0001-per-directory-sidecar-docs-in-tourbuilder.md`).
