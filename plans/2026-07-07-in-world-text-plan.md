# 2026-07-07 — Component 2: In-world text label / transcript (plan, rev. 1)

> Plan-First artifact (`TASK.md` §2.3.2), second Goal-1 warm-up component.
> Result of a design grilling on 2026-07-07 (Maria & Nico). Branch:
> `feature/in-world-text`. Follows Component 1's `components/<name>/{core,view}` +
> `demo.ts` + `index.html` structure inside `GpsPlusSlamJs_TourBuilder`.
>
> **Build note (standing preference):** per Nico, when the plan is agreed we build
> the **final, reusable, tested** version directly — we skip `TASK.md`'s
> throwaway-prototype step.

## 1. Use case & problem

Render a piece of styled text at a world position in 3D space, staying readable
(front-facing, upright) — the building block for the floating **story
transcripts** that accompany a waypoint's audio in noisy outdoor use. Like
Component 1 it is a **warm-up**: **no tour, no GPS, no Redux, no zip**. Its one
hard problem, set by the TASK, is that a transcript must also render **inside an
immersive WebXR session** on a phone, where a DOM/CSS overlay or `CSS3DRenderer`
is unreliable.

The TASK directs us to use the **HTML-in-3D** approach from
<https://repalash.com/three-html-render/> **first**, with a simpler XR-safe
**`THREE.CanvasTexture`** fallback. Investigation of the library
(`three-html-render`, npm) established the key facts that shaped this plan:

- It requires `three >= 0.150`; on `three >= 0.184` (TourBuilder is on `^0.184`)
  its `HTMLTexture` is the native class. Runtime, idempotent polyfill.
- The native "canvas-draw-element" fast path only exists behind a Chrome flag;
  **everywhere else it rasterizes an offscreen DOM subtree via an SVG
  `<foreignObject>` into an image/texture**. So on a normal Android phone it
  produces *a texture on a plane* — mechanically the same output shape as our
  Canvas fallback, just authored as HTML/CSS.
- Therefore, on the HTML path **the browser's CSS engine does line-breaking** —
  which is why we take ownership of wrapping/pagination ourselves (D9), so both
  backends agree and the fallback stays transparent.

This is the seed of Component 8's floating transcript (which composes a C2 text
panel next to a C1 transport panel around each knight).

### Decisions locked (grilling, 2026-07-07)

| #   | Decision                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **HTML-in-3D (`three-html-render`) is the primary backend; `CanvasTexture` is the XR-safe fallback** (per `TASK.md` §2.3.2).                                                                                                                                       |
| D2  | **Build both**, production-quality, behind **one stable factory** (`createInWorldText`) over a swappable **text-surface backend**. Fallback engages only when HTML fails — not a user toggle.                                                                       |
| D3  | **Fallback trigger = `try/catch` only** (wrap the async HTML render; degrade that label to Canvas on throw). No capability probe, no pixel readback. Justified by the **self-contained-HTML invariant** + Chrome/Android-only target (iOS/Safari out of scope).      |
| D4  | Pure, unit-tested core: `chooseTextBackend`, `wrapText` (injected `measure`), `paginate`, `textPageReducer`, `hitToPageIntent`, `resolveTextStyle`/sizing + the reused billboard yaw. **No** HTML sanitization/escaping in iter 1 (transcript is trusted content).   |
| D5  | Add **`components/shared/`** (not a runnable component) for cross-component code. `billboard-math` moves there; C1 + C2 import it. Small C1 refactor commit.                                                                                                        |
| D6  | Fixed-size panel with **paginated** text: **Prev/Next buttons** (large tap targets for XR-ray + touch) + **page indicator** (`2 / 5`), disabled/dimmed at edges. Modern, lean, dark semi-transparent style — not bulky.                                             |
| D7  | **One backend-agnostic interaction model**: our own pure **UV hit-mapping** (`hitToPageIntent`) for both backends. The library's `InteractionManager` is **unused**. Both backends render to a fixed **`PAGE_PANEL_LAYOUT`**.                                        |
| D8  | Keep the HTML-in-3D backend (offscreen render DOM only — invisible, outside the WebGL/XR canvas). "No DOM" applies to **interaction**, which is 100% raycast/UV.                                                                                                    |
| D9  | **We own wrapping + pagination for both backends**; each renders the pre-wrapped lines of the current page. Shared `measure` = an offscreen 2D-canvas `measureText`. HTML backend renders our line breaks (CSS auto-wrap disabled).                                  |
| D10 | Pure **`textPageReducer`** is the source of truth; view `applyState`s; demo dispatches (mirrors C1). Factory takes **raw text + style + `maxWidthMeters`** and wraps/paginates internally via the tested helpers.                                                    |
| D11 | Demo = desktop `OrbitControls` **default** + a minimal **`immersive-ar`** "Enter AR" button (VR fallback). XR `select`-ray reuses the same `hitTest`. `activeBackend` shown on-screen.                                                                              |
| D12 | (a) In C8, transcript (C2) and transport panel (C1) are **two independent billboarded panels** composed by C8; C2 has **zero** audio/transport coupling. (b) `shared/` = `billboard-math`, `clamp`, `panel-geometry` (`Rect`+`contains`), `canvas-panel` (`toPx`+`roundRect`); `hitToPageIntent` stays in C2. |
| D13 | Readability defaults: ~0.6 m panel @ ~1.5 m; ≥0.12 m tap targets; ~1024 px canvas + max anisotropy + mipmaps (`LinearMipmapLinear`); dark semi-transparent panel + near-white text + single accent; system `sans-serif` ~40–44 px; single-sided transparent plane.   |
| D14 | Placement `components/in-world-text/`; add `three-html-render` dep; text-only fixtures (short + long sample) + a "swap text" button; **no replay e2e** (not movement-dependent — proof = unit tests + interactive demo + manual on-phone XR); `billboard-math` upstream-PR deferred. |

## 2. Goals, requirements, success criteria

### Functional requirements

- Styled multi-line text at a world `THREE.Vector3`; yaws around **Y only** to
  face the user (pitch/roll 0), reusing `computeBillboardYaw` from `shared/`.
- Long text is **wrapped and paginated**; **Prev/Next** buttons move between
  pages with a **`n / total`** indicator; buttons dim/disable at the first/last
  page. Tap/`select` targets are generous (D13).
- Rendered by the **HTML-in-3D backend** by default; **automatically falls back**
  to the Canvas backend for a label whose HTML render throws (D3). Both backends
  show **identical pagination** (D9).
- `setText(newText)` re-wraps + re-paginates and resets to page 0.
- Renders correctly on desktop (orbit) **and** inside an `immersive-ar` session.

### Non-functional requirements

- Pure logic (wrap, paginate, page reducer, hit-mapping, style/sizing, backend
  choice, yaw) is framework- and view-free — unit-testable with no WebGL/DOM.
- **Self-contained-HTML invariant (D3):** the HTML backend's markup uses only
  text + inline CSS + system fonts — **zero cross-origin resources** — so
  `foreignObject` rasterization is never tainted and is deterministic.
- Reusable in any Three.js project; no AR/GPS/Redux coupling; C2 knows nothing
  about audio.
- Passes the TourBuilder gate: Prettier, ESLint, stylelint, jscpd (`minTokens`
  50 — hence `shared/`), dep-cruiser boundaries, dpdm cycles, knip, strict TS.

### Success criteria

1. **`wrapText`** (fake monospace `measure`): wraps at word boundaries, no line
   exceeds `maxWidthPx`, a single over-long word hard-breaks (documented rule),
   empty string → `[]`.
2. **`paginate`**: `linesPerPage` chunks; partial last page; exact multiple;
   fewer than one page → single page.
3. **`textPageReducer`**: `next`/`prev` clamp to `[0, pageCount-1]`; `setText`
   resets index to 0 + sets `pageCount`; `canPrev`/`canNext` correct at edges;
   `pageLabel` is 1-based `"n / total"`.
4. **`hitToPageIntent`**: hit in `prev` rect → `'prev'` only when `canPrev`
   (else `null`); `next` symmetric; text region / outside → `null`.
5. **`resolveTextStyle`/sizing**: lines + font px + `maxWidthMeters` → expected
   canvas pixel dims + plane meters; footer bar height reserved; plane aspect
   matches the canvas.
6. **`chooseTextBackend`**: `'html'→html`, `'canvas'→canvas` (pure).
7. **Demo (`pnpm dev`)**: labels render; orbiting (incl. high pitch) keeps them
   upright + front-facing; Prev/Next paginate with dimmed edges; "swap text"
   re-paginates + resets to page 1; HUD shows `activeBackend = 'html'` on Chrome.
8. **Enter AR (Android AR phone)**: a label renders legibly in `immersive-ar`;
   the XR `select` ray taps Prev/Next; record which backend rendered in-session
   (the residual-risk check for HTML rasterization mid-XR-frame).
9. **`pnpm test` green** (format + lint + lint:css + check:all + typecheck +
   unit); sidecar `*.md` for each behavior file; jscpd passes (shared primitives
   deduplicated, C1 refactored to import them).

> **Replay e2e** is intentionally out of scope: `TASK.md` requires it only for
> _movement-dependent_ components. Proof here = unit tests + interactive demo +
> the manual on-phone XR confirmation (same justification as Component 1).

## 3. Architecture

Pure `core/` (the reusable, tested heart) + a thin `view/` that composes it into
meshes + textures + picking, wired by `demo.ts`. Backend rendering is swappable
behind a `TextSurface` interface; everything else (wrap, paginate, page state,
hit-mapping, yaw) is backend-agnostic.

```
GpsPlusSlamJs_TourBuilder/
  components/
    shared/                      # NEW — cross-component, NOT a runnable component (D5, D12)
      billboard-math.ts     (+ .test.ts + .md)   # MOVED from billboard/core (computeBillboardYaw)
      clamp.ts              (+ .md)               # MOVED (clamp01)
      panel-geometry.ts     (+ .test.ts + .md)    # Rect + contains(rect,u,v)  (pure UV hit primitive)
      canvas-panel.ts       (+ .md)               # toPx(rect,w,h) + roundRect(ctx,...)  (view helpers)
    in-world-text/               # NEW component
      core/
        text-wrap.ts        (+ .test.ts + .md)    # wrapText(text, maxWidthPx, measure) -> string[]
        paginate.ts         (+ .test.ts + .md)    # paginate(lines, linesPerPage) -> string[][]
        text-page-state.ts  (+ .test.ts + .md)    # textPageReducer + canPrev/canNext/pageLabel
        page-layout.ts      (+ .test.ts + .md)    # PAGE_PANEL_LAYOUT + hitToPageIntent
        text-style.ts       (+ .test.ts + .md)    # resolveTextStyle + plane/canvas sizing
        backend-select.ts   (+ .test.ts + .md)    # chooseTextBackend(capability)
      view/
        text-surface.ts     (+ .md)               # TextSurface interface + createMeasure (canvas measureText)
        html-text-surface.ts(+ .md)               # three-html-render backend (offscreen DOM -> texture)
        canvas-text-surface.ts(+ .md)             # CanvasTexture backend
        in-world-text.ts    (+ .md)               # createInWorldText factory (billboard + applyState + hitTest + setText)
        text-interaction.ts (+ .md)               # Raycaster -> uv -> hitToPageIntent (pointer + XR select)
      demo.ts                                     # scene + OrbitControls + Enter-AR + dispatch + HUD
      index.html
      README.md
```

### Pure — text layout (`text-wrap.ts`, `paginate.ts`)

```ts
/** Width of a string in px, injected so wrapText is DOM-free & testable. */
export type Measure = (text: string) => number;

/** Greedy word-wrap to lines no wider than maxWidthPx. A single word wider than
 *  the line is hard-broken (rule pinned in the sidecar). */
export function wrapText(text: string, maxWidthPx: number, measure: Measure): string[];

/** Chunk wrapped lines into fixed-height pages. */
export function paginate(lines: readonly string[], linesPerPage: number): string[][];
```

The real `measure` (view side) is backed by an offscreen `CanvasRenderingContext2D`
at the resolved font (`createMeasure(style)` in `text-surface.ts`); **both**
backends use it so line counts match (D9).

### Pure — page state (`text-page-state.ts`, mirrors C1's transport reducer)

```ts
export interface TextPageState { readonly pageIndex: number; readonly pageCount: number; }
export type TextPageAction =
  | { type: 'next' } | { type: 'prev' }
  | { type: 'setText'; pageCount: number };            // resets pageIndex to 0

export const initialTextPageState = (pageCount: number): TextPageState => ({ pageIndex: 0, pageCount });
export function textPageReducer(s: TextPageState, a: TextPageAction): TextPageState; // clamps [0, count-1]
export function canPrev(s: TextPageState): boolean;    // pageIndex > 0
export function canNext(s: TextPageState): boolean;    // pageIndex < pageCount - 1
export function pageLabel(s: TextPageState): string;   // "2 / 5" (1-based)
```

### Pure — layout + hit-mapping (`page-layout.ts`; `Rect`/`contains` from `shared/`)

```ts
import { type Rect, contains } from '../../shared/panel-geometry.js';

export interface PagePanelLayout { prev: Rect; next: Rect; text: Rect; indicator: Rect; }
export const PAGE_PANEL_LAYOUT: PagePanelLayout; // footer bar with big prev/next; text fills the top

export type PageIntent = { type: 'prev' } | { type: 'next' } | null;

/** Disabled-aware: a hit on prev/next only fires if that direction is allowed. */
export function hitToPageIntent(
  uv: { u: number; v: number },
  nav: { canPrev: boolean; canNext: boolean },
  layout?: PagePanelLayout,
): PageIntent;
```

### Pure — style/sizing (`text-style.ts`) & backend choice (`backend-select.ts`)

```ts
export interface TextStyle { fontPx: number; lineHeightPx: number; paddingPx: number;
  maxLinesPerPage: number; panel: string; text: string; accent: string; maxWidthMeters: number; }
export const DEFAULT_TEXT_STYLE: TextStyle;                 // D13 values
export interface ResolvedTextStyle extends TextStyle { canvasW: number; canvasH: number;
  planeW: number; planeH: number; footerPx: number; }
/** Pure: pages/lines + style -> canvas px + plane meters (footer reserved, aspect matched). */
export function resolveTextStyle(style: TextStyle, linesPerPage: number): ResolvedTextStyle;

export type TextBackendKind = 'html' | 'canvas';
export function chooseTextBackend(capability: TextBackendKind): TextBackendKind; // pure selection seam
```

### View — swappable backend

```ts
export interface TextSurface {
  readonly texture: THREE.Texture;
  /** Draw the current page + footer (prev/next + label) into the backing medium. */
  render(page: readonly string[], style: ResolvedTextStyle,
         nav: { canPrev: boolean; canNext: boolean; label: string }): void;
  dispose(): void;
}
// canvas-text-surface.ts: 2D canvas -> CanvasTexture (draws lines + buttons at PAGE_PANEL_LAYOUT rects).
// html-text-surface.ts:  builds an offscreen DOM subtree (pre-wrapped lines, CSS auto-wrap OFF),
//                        HTMLTexture(el). Buttons positioned via absolute CSS at the SAME rects.
```

### View — factory (the component's public API)

```ts
export function createInWorldText(opts: {
  text: string;
  position: THREE.Vector3;
  maxWidthMeters?: number;                 // default from DEFAULT_TEXT_STYLE
  style?: Partial<TextStyle>;
  backend?: 'auto' | 'html' | 'canvas';    // 'auto' = html, try/catch -> canvas (D3)
}): {
  readonly group: THREE.Group;             // add to scene
  faceCamera(cameraPos: { x: number; z: number }): void;   // shared billboard yaw
  applyState(state: TextPageState): void;  // re-render current page + enabled states
  hitTest(uv: { u: number; v: number }, nav: { canPrev: boolean; canNext: boolean }): PageIntent;
  setText(text: string): number;           // re-wrap+paginate, returns new pageCount
  readonly activeBackend: 'html' | 'canvas';
  readonly pageCount: number;
  dispose(): void;
};
```

Internally the factory: resolves style → builds `measure` → `wrapText` →
`paginate` → tries `html-text-surface` (`try/catch` → `canvas-text-surface`) →
builds a single-sided transparent `PlaneGeometry(planeW, planeH)` with the
surface texture → returns the group + handles. `demo.ts` owns the
`TextPageState`, runs `textPageReducer`, and reconciles by calling `applyState`.

### View — interaction (`text-interaction.ts`)

One `THREE.Raycaster`; on a click (desktop) or XR `select` it raycasts the label
planes, reads `intersection.uv`, and calls `label.hitTest(uv, nav)` →
`prev`/`next` dispatched into the reducer. **Pointer-ray vs XR-`select`-ray is
the only thing that differs** between desktop and AR — the exact "ray-production
seam" Component 1 flagged for Component 8.

## 4. Test plan

**Unit (vitest):** `text-wrap`, `paginate`, `text-page-state`, `page-layout`
(`hitToPageIntent`), `text-style`, `backend-select`, plus the moved
`shared/billboard-math` and new `shared/panel-geometry`. All pure — no WebGL/DOM
(fake `measure` for wrapping).

**Manual/interactive:** success criteria #7 (desktop demo) and #8 (on-phone
`immersive-ar`) — the warm-up's stand-in for replay e2e (justified above).

```
pnpm dev            # http://localhost:<port>/components/in-world-text/
pnpm test           # format + lint + lint:css + check:all + typecheck + unit (the gate)
pnpm run test:unit  # fast vitest loop
```

## 5. Open questions (decide during build)

1. **Over-long-word rule** in `wrapText`: hard-break mid-word vs. allow overflow.
   Recommend hard-break (readability); pin in the sidecar + a test.
2. **`linesPerPage`**: fixed constant vs. derived from panel height / line
   height. Recommend derive in `resolveTextStyle` from `maxLinesPerPage`.
3. **Exact `PAGE_PANEL_LAYOUT` rects** and footer height — tune in the demo to
   hit the ≥0.12 m tap-target goal.
4. **Click-vs-orbit-drag guard** — reuse Component 1's small-move/short-time
   heuristic (OrbitControls owns drag).
5. **`immersive-ar` vs `immersive-vr`** availability detection + a graceful "XR
   not supported" message on unsupported desktops.
6. **Texture update cost**: re-render the surface only on page change / `setText`
   (not per frame); billboard yaw is transform-only and cheap.

## 6. Steps to execute (after plan sign-off)

1. **`shared/` extraction + C1 refactor (separate commit):** move
   `billboard-math` + `clamp` to `components/shared/`; extract `panel-geometry`
   (`Rect`+`contains`) and `canvas-panel` (`toPx`+`roundRect`); update Component
   1 imports; green `pnpm test` (jscpd now clean).
2. **Scaffold `components/in-world-text/`**; add `three-html-render` dep; commit
   text fixtures.
3. **TDD the pure `core/`** (`text-wrap`, `paginate`, `text-page-state`,
   `page-layout`, `text-style`, `backend-select`) + tests + sidecars; commit.
4. **Build `view/`** (both `TextSurface` backends, factory, interaction) +
   `demo.ts`/`index.html` + Enter-AR; commit.
5. Run the gate; verify success criteria #7 on desktop and #8 on an Android AR
   phone (record which backend rendered in-session).
```
