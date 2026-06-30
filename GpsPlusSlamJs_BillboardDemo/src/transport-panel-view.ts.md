# transport-panel-view.ts

## Purpose

In-world transport-panel view: draws the play/stop button and progress bar into
a 2D canvas, wraps it as a `THREE.CanvasTexture` on a plane. XR-safe (a DOM/CSS
overlay is unreliable in immersive WebXR, TASK §2.3.2); component 2 reuses the
canvas-texture technique for rich text. Control positions come from
[panel-layout](panel-layout.ts), so the pixels drawn line up with tap mapping.

## Public API

- `interface TransportPanel { mesh: THREE.Mesh; redraw(state, id); dispose() }`.
- `createTransportPanel(width, height, layout = DEFAULT_PANEL_LAYOUT): TransportPanel`.

## Invariants & assumptions

- The canvas is drawn from the **same `PanelLayout`** used for hit-mapping, in
  the same UV convention (origin bottom-left), so visuals and hit regions match.
- `redraw` reads only pure selectors (`isPlaying`, `progressFraction`); it holds
  no playback state itself.
- The owning billboard toggles `mesh.visible` (only the active panel is shown,
  which also makes only it raycaster-pickable).
- `dispose()` frees geometry, material, and the canvas texture.

## Examples

```ts
const panel = createTransportPanel(1.15, 0.4);
panel.mesh.position.set(0, -0.9, 0); // below the sprite
panel.redraw(state, billboardId);
```

## Tests

Not unit-tested (glyph rendering is view-layer). The layout maths and progress
fraction it draws from are tested in
[panel-layout.test.ts](panel-layout.test.ts) /
[playback-transport.test.ts](playback-transport.test.ts).
