# panel-layout.ts

## Purpose

Pure layout + hit-mapping for the in-world transport panel. The one place that
knows _where_ the play/stop button and progress-bar track live on the panel
(as normalized UV rectangles), so the same layout both draws the panel and
decides what a tap means. Renderer-free: the view raycasts the panel plane,
reads the hit UV, and asks `hitToIntent` what to do — identical on desktop
pointer and XR select.

## Public API

- `interface Rect { x; y; w; h }` — normalized panel-UV rectangle.
- `interface PanelLayout { button: Rect; track: Rect }`.
- `DEFAULT_PANEL_LAYOUT` — button on the left, wide track to its right.
- `type PanelIntent = { type: "toggle" } | { type: "seek"; fraction } | null`.
- `hitToIntent(uv, layout = DEFAULT_PANEL_LAYOUT): PanelIntent`.

## Invariants & assumptions

- UV convention matches `THREE.PlaneGeometry` intersection UVs: (0,0)
  bottom-left of the front face, u → right, v → up.
- **Button is resolved first**; the default layout keeps button and track
  disjoint so the ordering is unambiguous.
- A track hit → `seek` with `fraction = clamp01((u - track.x) / track.w)`.
- A hit outside both regions (panel padding/chrome) → `null` (no-op), so a tap
  in the gap never causes a phantom seek.

## Examples

```ts
const hit = raycaster.intersectObject(panelMesh)[0];
if (hit?.uv) {
  const intent = hitToIntent({ u: hit.uv.x, v: hit.uv.y });
  if (intent?.type === "toggle") dispatch({ type: "toggle" });
  else if (intent?.type === "seek")
    dispatch({ type: "seek", fraction: intent.fraction });
}
```

## Tests

[panel-layout.test.ts](panel-layout.test.ts) — button hit → toggle; track hit →
seek fraction (centre/edges, clamped); the inter-control gap and panel chrome →
null; and a guard that the default regions are disjoint.
