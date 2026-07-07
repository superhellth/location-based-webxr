# components/shared — cross-component building blocks

Small, framework-free modules reused by more than one component demo. This is
**not a runnable component** — it has no `demo.ts` / `index.html`; it is only
imported by the components under `components/*/`.

It exists so shared logic is defined **once** (the gate's jscpd duplication check
forbids copy-pasting ≥50 tokens across components) while keeping each component
independently demoable — importing a shared helper is fine, but one component
importing another component's internals is not.

## Modules

### `billboard-math.ts` — face-the-user math (pure)

`computeBillboardYaw(billboard, camera, fallback = 0)`: the single Y-rotation
(radians) that turns a plane's **+Z front face** toward the camera in the XZ
plane while keeping it upright (pitch/roll never written). Height is ignored by
design; a camera directly overhead returns `fallback`. Used by the clickable
billboard (component 1) and the in-world-text label (component 2). Upstream-PR
candidate (GPS-free, dependency-free).

### `clamp.ts` — `clamp01` (pure)

Clamp a value into the inclusive `[0, 1]` range. Used by the transport reducer's
`seek`, the panel-layout seek mapping (component 1), and text sizing (component 2).

### `panel-geometry.ts` — UV rectangles + hit test (pure)

The `Rect` type (normalized UV space, origin bottom-left per `PlaneGeometry`
intersection UVs) and `contains(rect, u, v)` (edges inclusive). Each component
builds its own `hitTo…Intent` mapping on top of this primitive.

### `canvas-panel.ts` — canvas draw helpers (view)

`toPx(rect, canvasW, canvasH)` converts a UV rect (origin bottom-left) to a
canvas pixel rect (origin top-left); `roundRect(ctx, x, y, w, h, r)` begins a
radius-clamped rounded-rect path. View-layer (touches a canvas context) but
framework-free.

### `resize.ts` — demo window-resize helper (view)

`attachResize(camera, renderer)` keeps a perspective camera + renderer in sync
with the window size. Shared by the component demos so the boilerplate lives once.

### `demo.css` — shared demo-page styles

Base styles for the demo pages (`:root`, `html/body`, `#canvas-root`, `#hud`,
`#status`). Each demo's `index.html` links it and keeps only component-specific
tweaks inline.

## Tests

`billboard-math.test.ts` and `panel-geometry.test.ts` cover the pure modules
(`clamp.ts` is exercised transitively; the `canvas-panel.ts` helpers are
view-layer and covered via each component's panel). Run `pnpm test:unit`.
