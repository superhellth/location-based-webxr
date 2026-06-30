# clickable-billboard.ts

## Purpose

The composition unit: a textured sprite plane + the in-world transport panel
below it, both yawing to face the user (billboard math), with an audio element
driven by the transport reducer. Fed **ready resources** (a loaded
`THREE.Texture` + an `HTMLAudioElement`) — the same seam component 8 reuses,
swapping the plane for a GLTF model and the element for an asset-provider URL.

## Public API

- `interface BillboardUserData { billboardId; role: "sprite" | "panel" }` —
  stamped on each pickable mesh for raycaster classification.
- `interface ClickableBillboard { id; group; pickTargets; faceCamera(camPos); applyState(state); dispose() }`.
- `createClickableBillboard({ id, position, texture, audio, onTick, onEnded }): ClickableBillboard`.

## Invariants & assumptions

- `faceCamera` yaws the **whole group**; the panel sits on the group's Y axis so
  a Y rotation keeps it directly below the sprite while both face the camera.
- `applyState` is this billboard's reconcile slice: show/redraw the panel iff
  active; re-seek the audio only when it drifts > `SEEK_SYNC_EPSILON_SEC` (0.3 s)
  from the model (a click restart or a bar seek), so the ~4 Hz `timeupdate`
  feedback never fights normal playback; then play/pause to match `isPlaying`.
- Only the active billboard's panel is `visible` (and thus pickable).
- `dispose()` releases the audio, the sprite GPU resources (via the framework's
  `disposeObject3D`), and the panel's canvas texture.

## Examples

```ts
const b = createClickableBillboard({
  id: "knight-1",
  position: new Vector3(-2, 0.6, 0),
  texture,
  audio,
  onTick: (id, pos, dur) =>
    dispatch({ type: "tick", positionSec: pos, durationSec: dur }),
  onEnded: (id) => dispatch({ type: "ended", id }),
});
scene.add(b.group);
// per frame: b.faceCamera(cameraWorldPos); on state change: b.applyState(state);
```

## Tests

Not unit-tested (Three.js/DOM view layer). Its pure inputs are covered by
[billboard-math.test.ts](billboard-math.test.ts) and
[playback-transport.test.ts](playback-transport.test.ts); the composed behaviour
is verified manually via the demo.
