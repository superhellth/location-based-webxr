# css3d-renderer-manager.ts

## Purpose

Factory function that creates and manages a `CSS3DRenderer` overlay for compositing DOM-based 3D objects (e.g., Leaflet map inside a `CSS3DObject`) alongside the WebGL renderer in the same scene.

## Public API

### `createCss3dRendererManager(container, width, height): Css3dRendererManager`

| Param       | Type          | Description                                     |
| ----------- | ------------- | ----------------------------------------------- |
| `container` | `HTMLElement` | Parent element (CSS3D overlay is appended here) |
| `width`     | `number`      | Initial width in pixels                         |
| `height`    | `number`      | Initial height in pixels                        |

### `Css3dRendererManager` (interface)

| Method                  | Description                               |
| ----------------------- | ----------------------------------------- |
| `render(scene, camera)` | Render one frame of the CSS3D layer       |
| `setSize(w, h)`         | Resize the CSS3D renderer                 |
| `dispose()`             | Remove the DOM element and stop rendering |

## Invariants & Assumptions

- The CSS3D DOM element is styled with `position: absolute; pointer-events: none` so it overlays the WebGL canvas without intercepting clicks.
- After `dispose()`, `render()` calls are silently ignored (idempotent).
- The caller is responsible for calling `render()` with the same scene/camera used by the WebGL renderer each frame.

## Examples

```ts
import { createCss3dRendererManager } from './css3d-renderer-manager';

const mgr = createCss3dRendererManager(document.body, 800, 600);

// In render loop:
mgr.render(scene, camera);

// On resize:
mgr.setSize(newWidth, newHeight);

// Cleanup:
mgr.dispose();
```

## Tests

- `css3d-renderer-manager.test.ts` — 8 unit tests covering creation/DOM insertion, rendering, resize, and dispose behavior.
