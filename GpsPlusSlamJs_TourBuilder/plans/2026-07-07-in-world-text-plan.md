# 2026-07-07 — Component 2: In-world text label / transcript (plan, rev. 2)

> Plan-First artifact (`TASK.md` §2.3.2), second Goal-1 warm-up component.
> Result of a design grilling on 2026-07-07 (Maria & Nico). Branch:
> `feature/in-world-text`. Follows Component 1's `components/<name>/{core,view}` +
> `demo.ts` + `index.html` structure inside `GpsPlusSlamJs_TourBuilder`.
>
> **Build note (standing preference):** per Nico, when the plan is agreed we build
> the **final, reusable, tested** version directly — we skip `TASK.md`'s
> throwaway-prototype step.
>
> **Rev. 2 (self-critical review round):** hardened the fallback story where it is
> load-bearing — an **async-render timeout** (R1) and a **runtime `swapToCanvas`**
> path (R2) so "fallback only if HTML fails" holds at the *moment* of failure, not
> only at construction; made surface rendering **async-internal + double-buffered**
> (R3); added **measure safety margins** so metric drift never clips (R4); added a
> **fallback-wiring unit test via DI** + a happy-dom smoke test (R5); extracted a
> pure **`describePanel → PanelDrawModel`** consumed by both backends (R6);
> **dropped `chooseTextBackend`** — the runtime net subsumes it (R7); and **moved
> page state into the label** (per-label, ephemeral view state — B, revises D10).

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
  `<foreignObject>` into an image/texture** — an inherently **asynchronous**
  step (SVG-image `onload`). So on a normal Android phone it produces *a texture
  on a plane* — mechanically the same output shape as our Canvas fallback.
- Therefore, on the HTML path **the browser's CSS engine does line-breaking** —
  which is why we take ownership of wrapping/pagination ourselves (D9), so both
  backends agree and the fallback stays transparent.

This is the seed of Component 8's floating transcript (which composes a C2 text
panel next to a C1 transport panel around each knight).

### Decisions locked (grilling 2026-07-07; R-rows added in rev. 2)

| #   | Decision                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **HTML-in-3D (`three-html-render`) is the primary backend; `CanvasTexture` is the XR-safe fallback** (per `TASK.md` §2.3.2).                                                                                                                                       |
| D2  | **Build both**, production-quality, behind **one stable factory** (`createInWorldText`) over a swappable **`TextSurface`** backend. Fallback engages only when HTML fails — not a user toggle.                                                                      |
| D3  | **Fallback trigger = `try/catch` + async-render timeout** (R1). No capability probe, no pixel readback. Justified by the **self-contained-HTML invariant** + Chrome/Android-only target (iOS/Safari out of scope).                                                  |
| D4  | Pure, unit-tested core: `wrapText` (injected `measure`), `paginate`, `textPageReducer`, `hitToPageIntent`, `resolveTextStyle`/sizing, **`describePanel`** (R6), + the reused billboard yaw. **No** `chooseTextBackend` (R7). **No** HTML sanitization in iter 1.      |
| D5  | Add **`components/shared/`** (not a runnable component) for cross-component code. `billboard-math` moves there; C1 + C2 import it. Small C1 refactor commit.                                                                                                        |
| D6  | Fixed-size panel with **paginated** text: **Prev/Next buttons** (large tap targets) + **page indicator** (`2 / 5`), disabled/dimmed at edges. Modern, lean, dark semi-transparent style.                                                                            |
| D7  | **One backend-agnostic interaction model**: pure **UV hit-mapping** (`hitToPageIntent`) for both backends. The library's `InteractionManager` is **unused**. Both backends render to a fixed **`PAGE_PANEL_LAYOUT`** (via the shared `PanelDrawModel`, R6).           |
| D8  | Keep the HTML-in-3D backend (offscreen render DOM only — invisible, outside the WebGL/XR canvas). "No DOM" applies to **interaction**, which is 100% raycast/UV.                                                                                                    |
| D9  | **We own wrapping + pagination for both backends**; each renders the pre-wrapped lines of the current page. Shared `measure` = offscreen 2D-canvas `measureText` with a **~0.95 width safety margin** (R4). HTML backend renders our line breaks (CSS auto-wrap off + `overflow:hidden`, `line-height` pinned). |
| D10 | Pure **`textPageReducer`** is the source of truth, **hosted inside each label** (per-label ephemeral view state — B, rev. 2). Label exposes `next`/`prev`/`setText`/`pageLabel`; view re-renders itself. Factory takes **raw text + style + `maxWidthMeters`**.        |
| D11 | Demo = desktop `OrbitControls` **default** + a minimal **`immersive-ar`** "Enter AR" button (VR fallback). XR `select`-ray reuses the same `hitTest`. `activeBackend` shown on-screen (flips if a swap happens).                                                     |
| D12 | (a) In C8, transcript (C2) and transport panel (C1) are **two independent billboarded panels** composed by C8; C2 has **zero** audio/transport coupling. (b) `shared/` = `billboard-math`, `clamp`, `panel-geometry` (`Rect`+`contains`), `canvas-panel` (`toPx`+`roundRect`); `hitToPageIntent` stays in C2. |
| D13 | Readability defaults: ~0.6 m panel @ ~1.5 m; ≥0.12 m tap targets; ~1024 px canvas + max anisotropy + mipmaps; dark semi-transparent panel + near-white text + single accent; system `sans-serif` ~40–44 px; single-sided transparent plane.                          |
| D14 | Placement `components/in-world-text/`; add `three-html-render` dep; text-only fixtures (short + long) + a "swap text" button; **no replay e2e** (proof = unit tests + interactive demo + manual on-phone XR); `billboard-math` upstream-PR deferred.                   |
| R1  | **Async-render timeout:** if the HTML surface's raster promise does not resolve within `htmlRenderTimeoutMs` (~400 ms default), treat it as failure → fall back. Covers "silently never completes" — the case `try/catch` alone misses.                              |
| R2  | **Runtime `swapToCanvas`:** on a caught/timed-out HTML render (incl. *after* entering XR), dispose the HTML surface, build a Canvas surface for that label, re-render the current page, flip `activeBackend`. Fallback holds at the moment of failure, not only at build. |
| R3  | **Async-internal render + double-buffer:** `TextSurface.render` stays `void` but updates the texture when the raster completes (`needsUpdate`); the HTML backend keeps showing the previous page's image until the new one is ready (no blank frame).                  |
| R4  | **Measure safety margins:** wrap to `maxWidthPx * ~0.95`; HTML text container gets `overflow:hidden` + pinned `line-height` + fixed height, so `measureText`↔CSS metric drift degrades to a hidden sub-pixel, never a reflow/clip.                                    |
| R5  | **Fallback-wiring is unit-tested** (via DI: inject a throwing surface-factory, assert `activeBackend==='canvas'` + a page still renders) + a happy-dom smoke test that `html-text-surface` constructs and yields a texture.                                          |
| R6  | **Pure `describePanel(page, style, nav) → PanelDrawModel`** — positions (px rects), nav label, enabled flags. Both backends consume it (canvas draws it; HTML positions elements at the same rects). Dedups the backends (jscpd) + adds a testable pure unit.          |
| R7  | **`chooseTextBackend` dropped.** The `backend` option is resolved inline (`'canvas'` forces Canvas; `'auto'`/`'html'` try HTML with the R1/R2 runtime net). A separate selection module is redundant once the runtime fallback exists.                                |

## 2. Goals, requirements, success criteria

### Functional requirements

- Styled multi-line text at a world `THREE.Vector3`; yaws around **Y only** to
  face the user (pitch/roll 0), reusing `computeBillboardYaw` from `shared/`.
- Long text is **wrapped and paginated**; **Prev/Next** buttons move between
  pages with a **`n / total`** indicator; buttons dim/disable at first/last page.
- Rendered by the **HTML-in-3D backend** by default; **automatically falls back**
  to Canvas for a label whose HTML render throws **or times out (R1)** — including
  a swap that happens *after* entering XR (R2). Both backends show **identical
  pagination** (D9).
- `setText(newText)` re-wraps + re-paginates and resets to page 0.
- Renders correctly on desktop (orbit) **and** inside an `immersive-ar` session.

### Non-functional requirements

- Pure logic (wrap, paginate, page reducer, hit-mapping, style/sizing,
  `describePanel`, yaw) is framework- and view-free — unit-testable, no WebGL/DOM.
- **Self-contained-HTML invariant (D3):** the HTML markup uses only text + inline
  CSS + system fonts — **zero cross-origin resources** — so `foreignObject`
  rasterization is never tainted and is deterministic.
- Reusable in any Three.js project; no AR/GPS/Redux coupling; C2 knows nothing
  about audio.
- Passes the TourBuilder gate: Prettier, ESLint, stylelint, jscpd (`minTokens`
  50 — hence `shared/` + `describePanel`), dep-cruiser, dpdm, knip, strict TS.

### Success criteria

1. **`wrapText`** (fake monospace `measure`): wraps at word boundaries, no line
   exceeds `maxWidthPx * 0.95`, a single over-long word hard-breaks (documented
   rule), empty string → `[]`.
2. **`paginate`**: `linesPerPage` chunks; partial last page; exact multiple;
   fewer than one page → single page.
3. **`textPageReducer`**: `next`/`prev` clamp to `[0, pageCount-1]`; `setText`
   resets index to 0 + sets `pageCount`; `canPrev`/`canNext` correct at edges;
   `pageLabel` is 1-based `"n / total"`.
4. **`hitToPageIntent`**: hit in `prev` rect → `'prev'` only when `canPrev`
   (else `null`); `next` symmetric; text region / outside → `null`.
5. **`resolveTextStyle`/sizing**: lines + font px + `maxWidthMeters` → expected
   canvas px + plane meters; footer height reserved; plane aspect matches canvas.
6. **`describePanel`** (R6): given page + style + nav → correct px rects, nav
   label, and enabled flags (both backends read this identical model).
7. **Fallback wiring (R5)**: with an injected throwing surface-factory, the
   factory yields `activeBackend === 'canvas'` and still renders the current
   page; a timeout (fake timer) triggers the same swap.
8. **Demo (`pnpm dev`)**: labels render; orbiting keeps them upright +
   front-facing; Prev/Next paginate with dimmed edges; "swap text" re-paginates +
   resets to page 1; HUD shows `activeBackend = 'html'` on Chrome.
9. **Enter AR (Android AR phone)**: a label renders legibly in `immersive-ar`;
   the XR `select` ray taps Prev/Next; record which backend rendered in-session
   (the residual-risk check for HTML rasterization mid-XR-frame — a *janky but
   succeeds* raster won't auto-swap; that's a manual judgment call).
10. **`pnpm test` green** (format + lint + lint:css + check:all + typecheck +
    unit); sidecar `*.md` per behavior file; jscpd passes.

> **Replay e2e** is intentionally out of scope: `TASK.md` requires it only for
> _movement-dependent_ components. Proof here = unit tests + interactive demo +
> the manual on-phone XR confirmation (same justification as Component 1).

## 3. Architecture

Pure `core/` (the reusable, tested heart) + a thin `view/` that composes it into
meshes + textures + picking, wired by `demo.ts`. Backend rendering is swappable
behind a `TextSurface`; everything else (wrap, paginate, page state, hit-mapping,
`describePanel`, yaw) is backend-agnostic. **Page state is hosted in the label**
(D10 rev. 2): each label instance owns a `TextPageState` driven by the pure
`textPageReducer`, because page navigation is per-label, ephemeral view state
that no store should hold.

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
        describe-panel.ts   (+ .test.ts + .md)    # describePanel(page,style,nav) -> PanelDrawModel  (R6)
      view/
        text-surface.ts     (+ .md)               # TextSurface interface + createMeasure (canvas measureText)
        html-text-surface.ts(+ .md)               # three-html-render backend (async raster, double-buffered R3)
        canvas-text-surface.ts(+ .md)             # CanvasTexture backend (sync draw)
        in-world-text.ts    (+ .test.ts + .md)     # createInWorldText factory: billboard + internal page state
                                                  #   + try/catch/timeout/swapToCanvas (R1,R2). Fallback test (R5).
        text-interaction.ts (+ .md)               # Raycaster -> uv -> label.hitTest (pointer + XR select)
      demo.ts                                     # scene + OrbitControls + Enter-AR + HUD (no central state)
      index.html
      README.md
```

### Pure — text layout (`text-wrap.ts`, `paginate.ts`)

```ts
export type Measure = (text: string) => number;   // injected -> DOM-free, testable
/** Greedy word-wrap to lines <= maxWidthPx (caller passes maxWidthPx*0.95, R4).
 *  A single word wider than the line is hard-broken (rule pinned in the sidecar). */
export function wrapText(text: string, maxWidthPx: number, measure: Measure): string[];
export function paginate(lines: readonly string[], linesPerPage: number): string[][];
```

The real `measure` (view side) is an offscreen `CanvasRenderingContext2D` at the
resolved font (`createMeasure(style)` in `text-surface.ts`); **both** backends
use it so line counts match (D9).

### Pure — page state (`text-page-state.ts`), hosted in the label (D10 rev. 2)

```ts
export interface TextPageState { readonly pageIndex: number; readonly pageCount: number; }
export type TextPageAction =
  | { type: 'next' } | { type: 'prev' } | { type: 'setText'; pageCount: number };
export const initialTextPageState = (pageCount: number): TextPageState => ({ pageIndex: 0, pageCount });
export function textPageReducer(s: TextPageState, a: TextPageAction): TextPageState; // clamps [0, count-1]
export function canPrev(s: TextPageState): boolean;
export function canNext(s: TextPageState): boolean;
export function pageLabel(s: TextPageState): string;   // "2 / 5"
```

Still pure and unit-tested; the *host* is the label, not the demo.

### Pure — layout + hit-mapping (`page-layout.ts`; `Rect`/`contains` from `shared/`)

```ts
import { type Rect, contains } from '../../shared/panel-geometry.js';
export interface PagePanelLayout { prev: Rect; next: Rect; text: Rect; indicator: Rect; }
export const PAGE_PANEL_LAYOUT: PagePanelLayout;       // footer bar w/ big prev/next; text fills the top
export type PageIntent = { type: 'prev' } | { type: 'next' } | null;
/** Disabled-aware: prev/next fire only if that direction is allowed. */
export function hitToPageIntent(uv: { u: number; v: number },
  nav: { canPrev: boolean; canNext: boolean }, layout?: PagePanelLayout): PageIntent;
```

### Pure — style/sizing (`text-style.ts`) & draw model (`describe-panel.ts`, R6)

```ts
export interface TextStyle { fontPx: number; lineHeightPx: number; paddingPx: number;
  maxLinesPerPage: number; panel: string; text: string; accent: string; maxWidthMeters: number; }
export const DEFAULT_TEXT_STYLE: TextStyle;            // D13 values; maxLinesPerPage is authoritative
export interface ResolvedTextStyle extends TextStyle { canvasW: number; canvasH: number;
  planeW: number; planeH: number; footerPx: number; }
export function resolveTextStyle(style: TextStyle): ResolvedTextStyle;   // maxLinesPerPage in -> sizes out

// R6: single pure description both backends render.
export interface PanelDrawModel {
  readonly panelRectPx: { x: number; y: number; w: number; h: number };
  readonly lines: readonly { text: string; xPx: number; yPx: number }[];
  readonly prev: { rectPx: Rect; enabled: boolean };
  readonly next: { rectPx: Rect; enabled: boolean };
  readonly indicator: { text: string; xPx: number; yPx: number };
}
export function describePanel(page: readonly string[], style: ResolvedTextStyle,
  nav: { canPrev: boolean; canNext: boolean; label: string }, layout?: PagePanelLayout): PanelDrawModel;
```

### View — swappable backend (async-internal + double-buffered, R3)

```ts
export interface TextSurface {
  readonly texture: THREE.Texture;
  /** Render a draw model. Returns immediately; the HTML backend updates the
   *  texture (needsUpdate) when its async raster completes, keeping the previous
   *  image visible until then (R3). */
  render(model: PanelDrawModel, style: ResolvedTextStyle): void;
  /** Resolves when the most recent render's raster has completed (or rejects/
   *  times out) — used by the factory's timeout/swap logic (R1). */
  settled(): Promise<void>;
  dispose(): void;
}
// canvas-text-surface: draws PanelDrawModel to a 2D canvas -> CanvasTexture (settled() resolves immediately).
// html-text-surface:  builds an offscreen DOM subtree from PanelDrawModel (pre-wrapped lines, auto-wrap OFF,
//                     overflow:hidden, line-height pinned R4); HTMLTexture(el); settled() tracks the SVG raster.
```

### View — factory (the component's public API; hosts state, owns fallback)

```ts
export function createInWorldText(opts: {
  text: string;
  position: THREE.Vector3;
  maxWidthMeters?: number;
  style?: Partial<TextStyle>;
  backend?: 'auto' | 'html' | 'canvas';   // 'canvas' forces fallback; 'auto'/'html' try HTML (R1/R2 net)
  htmlRenderTimeoutMs?: number;            // R1, default ~400
  createSurface?: SurfaceFactory;          // DI seam for the R5 fallback test
}): {
  readonly group: THREE.Group;
  faceCamera(cameraPos: { x: number; z: number }): void;   // shared billboard yaw
  next(): void; prev(): void;              // dispatch textPageReducer internally + re-render
  setText(text: string): void;             // re-wrap+paginate, reset to page 0
  hitTest(uv: { u: number; v: number }): PageIntent;        // uses internal nav state
  readonly pageLabel: string;              // "2 / 5"
  readonly activeBackend: 'html' | 'canvas';                // may flip after a swap (R2)
  dispose(): void;
};
```

Internals: resolve style → `createMeasure` → `wrapText` → `paginate` → build the
requested surface (`'canvas'` direct; else HTML) → render page 0's
`describePanel` model → `await surface.settled()` under `Promise.race` with the
timeout; on reject/timeout/throw → **`swapToCanvas`** (R2). `next/prev/setText`
mutate the internal `TextPageState`, then `describePanel` + `surface.render`;
each render is guarded the same way, so a *later* (in-XR) HTML failure also swaps.
The plane is a single-sided transparent `PlaneGeometry(planeW, planeH)`.

### View — interaction (`text-interaction.ts`)

One `THREE.Raycaster`; on a click (desktop) or XR `select`, raycast the label
planes, read `intersection.uv`, call `label.hitTest(uv)` → `label.next()/prev()`.
**Pointer-ray vs XR-`select`-ray is the only difference** between desktop and AR
— the "ray-production seam" Component 1 flagged for Component 8. With state in the
label, the demo holds **no** per-label bookkeeping and multi-label just works.

## 4. Test plan

**Unit (vitest):** `text-wrap`, `paginate`, `text-page-state`, `page-layout`
(`hitToPageIntent`), `text-style`, `describe-panel`, plus moved
`shared/billboard-math` and new `shared/panel-geometry`. All pure — no WebGL/DOM.

**Fallback wiring (R5):** `in-world-text.test.ts` injects a `createSurface` that
throws (and one that never `settled()`s, with fake timers) → asserts
`activeBackend === 'canvas'` and the current page still renders. A happy-dom
smoke test constructs `html-text-surface` and asserts it yields a `THREE.Texture`
(catches `three-html-render` API breakage without a GPU).

**Manual/interactive:** success criteria #8 (desktop demo) and #9 (on-phone
`immersive-ar`) — the warm-up's stand-in for replay e2e (justified above).

```
pnpm dev            # http://localhost:<port>/components/in-world-text/
pnpm test           # format + lint + lint:css + check:all + typecheck + unit (the gate)
pnpm run test:unit  # fast vitest loop
```

## 5. Open questions (decide during build)

1. **Over-long-word rule** in `wrapText`: hard-break vs. overflow. Recommend
   hard-break; pin in the sidecar + a test.
2. **`htmlRenderTimeoutMs` value** (R1): ~400 ms is a guess; tune on the phone so
   a slow-but-fine raster doesn't false-trigger a swap.
3. **Exact `PAGE_PANEL_LAYOUT` rects** + footer height — tune in the demo to hit
   the ≥0.12 m tap-target goal.
4. **Click-vs-orbit-drag guard** — reuse Component 1's small-move/short-time
   heuristic.
5. **`immersive-ar` vs `immersive-vr`** detection + a graceful "XR not supported"
   message on desktop.

## 6. Steps to execute (after plan sign-off)

1. **`shared/` extraction + C1 refactor (separate commit):** move
   `billboard-math` + `clamp` to `components/shared/`; extract `panel-geometry`
   (`Rect`+`contains`) and `canvas-panel` (`toPx`+`roundRect`); update Component
   1 imports; green `pnpm test` (jscpd clean).
2. **Scaffold `components/in-world-text/`**; add `three-html-render` dep; commit
   text fixtures.
3. **TDD the pure `core/`** (`text-wrap`, `paginate`, `text-page-state`,
   `page-layout`, `text-style`, `describe-panel`) + tests + sidecars; commit.
4. **Build `view/`** (both `TextSurface` backends w/ async+double-buffer R3,
   factory w/ timeout+swap R1/R2, interaction) + the **fallback unit test (R5)** +
   `demo.ts`/`index.html` + Enter-AR; commit.
5. Run the gate; verify success criteria #8 on desktop and #9 on an Android AR
   phone (record which backend rendered in-session).
```
