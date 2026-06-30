# billboard-interaction.ts

## Purpose

Pointer picking for the demo: raycasts the billboards' sprite + panel meshes on
a click and reports a classified hit — a sprite click (by id) or a panel hit (by
id + local UV, which [panel-layout](panel-layout.ts) turns into toggle/seek). A
drag guard tells a tap apart from an OrbitControls camera-drag.

## Public API

- `createBillboardInteraction({ domElement, camera, getPickTargets, onSpriteClick(id), onPanelHit(id, uv) }): { dispose() }`.

## Invariants & assumptions

- A pointer counts as a **tap** only if it moved ≤ 5 px and released within
  400 ms; otherwise it is treated as a camera orbit and ignored.
- Classification reads `mesh.userData` as
  [`BillboardUserData`](clickable-billboard.ts); the first ray hit wins.
- Invisible (inactive) panels are skipped by the raycaster, so only the open
  panel is interactive.
- This is the **only** desktop/AR difference: component 8 swaps the
  `pointerup`-raycast for the WebXR `select` ray, keeping the same callbacks.

## Examples

```ts
createBillboardInteraction({
  domElement: renderer.domElement,
  camera,
  getPickTargets: () => billboards.flatMap((b) => b.pickTargets),
  onSpriteClick: (id) => dispatch({ type: "click", id }),
  onPanelHit: (_id, uv) => {
    const intent = hitToIntent(uv);
    if (intent?.type === "toggle") dispatch({ type: "toggle" });
    else if (intent?.type === "seek")
      dispatch({ type: "seek", fraction: intent.fraction });
  },
});
```

## Tests

Not unit-tested (raycasting + pointer events are view-layer). The intent mapping
it feeds is pinned in [panel-layout.test.ts](panel-layout.test.ts).
