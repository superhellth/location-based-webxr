# GPS+SLAM App Framework

Reusable building blocks for AR+GPS applications built on [gps-plus-slam-js](../GpsPlusSlamJs/).

This library provides WebXR session management, Three.js visualization, GPS sensor coordination, storage abstractions, a replay engine, and store wiring — everything a web-based AR+GPS app needs beyond the core alignment algorithms.

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Your App                                        │
│  (UI, screen flow, app-specific logic)           │
├──────────────────────────────────────────────────┤
│  gps-plus-slam-app-framework  ← this package     │
│  (WebXR, Three.js, sensors, storage, replay)     │
├──────────────────────────────────────────────────┤
│  gps-plus-slam-js  (core algorithms)             │
│  (GPS/AR alignment, outlier rejection, GPS math) │
└──────────────────────────────────────────────────┘
```

The framework never imports from your app. Your app imports from the framework and the core library. The core library never imports from the framework.

## Installation

```bash
npm install gps-plus-slam-app-framework gps-plus-slam-js
```

### Peer Dependencies

Required:

- `three` (>= 0.170.0)
- `@zip.js/zip.js` (>= 2.7.0)
- `h3-js` (>= 4.0.0)
- `@reduxjs/toolkit` (>= 2.9.0)

Optional:

- `leaflet` (>= 1.9.0) — only needed if using `LeafletMapOverlay`
- `@sentry/browser` (>= 10.0.0) — only needed for error reporting integration

## Quick Start

```typescript
import { createRecorderStore } from 'gps-plus-slam-app-framework/state';
import { initAR } from 'gps-plus-slam-app-framework/ar';
import { startGpsWatch } from 'gps-plus-slam-app-framework/sensors';
import { wireStoreSubscribers } from 'gps-plus-slam-app-framework/state';
import { LeafletMapOverlay } from 'gps-plus-slam-app-framework/visualization';

// 1. Create store (wraps gps-plus-slam-js store with app-level slices)
const store = createRecorderStore();

// 2. Start GPS
startGpsWatch(
  (pos) => {
    /* feed position to recording coordinator */
  },
  (err) => {
    /* handle error */
  }
);

// 3. Start WebXR AR session
const container = document.getElementById('app')!;
await initAR(container);

// 4. Wire store → visualization
wireStoreSubscribers(store, {
  /* visualization dependencies */
});
```

Import from **subpaths** (e.g., `gps-plus-slam-app-framework/ar`) for clarity. The root barrel re-exports most symbols but some names overlap across modules.

## Modules

### `ar/` — WebXR & 3D Scene

WebXR session lifecycle, Three.js renderer setup, image/depth capture, and replay scene management.

| Export                                       | Description                                      |
| -------------------------------------------- | ------------------------------------------------ |
| `initAR(container)`                          | Start a WebXR AR session with Three.js rendering |
| `endARSession()`                             | End the active XR session                        |
| `startImageCapture()` / `stopImageCapture()` | Toggle camera frame capture                      |
| `startDepthCapture()` / `stopDepthCapture()` | Toggle depth sampling                            |
| `initReplayScene(container)`                 | Create a 3D replay scene with orbit/FPS controls |
| `ImageCaptureManager`                        | Configurable camera frame capture pipeline       |
| `DepthSampler`                               | Depth buffer sampling with configurable grids    |
| `CameraBlitCapture`                          | GPU blit-based camera capture                    |
| `TrackingStateManager`                       | AR tracking state monitoring                     |

### `sensors/` — GPS & Permissions

GPS watch abstraction, device orientation, and permission probing.

| Export                        | Description                       |
| ----------------------------- | --------------------------------- |
| `startGpsWatch(onPos, onErr)` | Start watching GPS position       |
| `stopGpsWatch()`              | Stop GPS watch                    |
| `startOrientationWatch(cb)`   | Start device orientation events   |
| `checkAllPermissions()`       | Probe camera, GPS, XR permissions |
| `requestAllPermissions()`     | Request all needed permissions    |
| `getGpsErrorMessage(code)`    | Human-readable GPS error messages |

### `state/` — Store & Recording

Combined Redux store factory, recording coordinator, replay engine, and store subscribers.

| Export                              | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `createRecorderStore(options?)`     | Create a combined store (core + app slices)   |
| `startSession()` / `endSession()`   | Session lifecycle actions                     |
| `recordGpsEvent(payload)`           | Record a paired AR+GPS observation            |
| `createGpsPositionHandler(config)`  | Factory for GPS→store wiring                  |
| `ReplayEngine`                      | Timed action playback with pause/resume/speed |
| `replayRecording(store, blob)`      | Replay a ZIP recording into a store           |
| `wireStoreSubscribers(store, deps)` | Bridge store state → visualization updates    |
| `loadRecordingOptions()`            | Load persisted recording settings             |
| `refPointsReducer`                  | Reference point state reducer                 |

### `storage/` — OPFS, ZIP, File System

Storage abstractions, OPFS implementation, ZIP export/import, and reference point persistence.

| Export                                 | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| `StorageBackend`                       | Abstract storage interface (implement your own) |
| `OpfsStorageBackend`                   | OPFS-based `StorageBackend` implementation      |
| `NullStorageBackend`                   | No-op backend for testing                       |
| `initOpfsStorage()`                    | Initialize OPFS directory structure             |
| `initStorage(backend)`                 | Initialize the file-system layer                |
| `exportSessionAsZip(handle)`           | Export a recording session as a ZIP blob        |
| `loadActionsFromZip(blob)`             | Parse recorded actions from a ZIP file          |
| `importRefPointsFromFolder(handle)`    | Import reference points from prior sessions     |
| `saveRefPointObservation(handle, obs)` | Persist a reference point observation           |

### `visualization/` — Three.js & Maps

Three.js markers, Leaflet map overlay, alignment interpolation, and camera controls.

| Export                         | Description                                         |
| ------------------------------ | --------------------------------------------------- |
| `LeafletMapOverlay`            | 2D Leaflet map integrated via CSS3D into a 3D scene |
| `MapOverlay`                   | Tile-based 3D map overlay (no Leaflet dependency)   |
| `GpsEventVisualizer`           | Three.js spheres for GPS event positions            |
| `RefPointVisualizer`           | Three.js spheres for reference points               |
| `createAlignmentLerper()`      | Smooth alignment matrix interpolation               |
| `createCameraFollower()`       | Camera that tracks a moving target                  |
| `createCss3dRendererManager()` | CSS3D renderer for HTML-in-3D overlays              |
| `createGpsCompassCubes()`      | Cardinal direction indicator cubes                  |
| `VIS_COLORS`                   | Consistent color palette for visualizations         |
| `disposeObject3D(obj)`         | Safe Three.js object disposal                       |

### `ref-points/` — H3 Spatial Indexing

H3-based proximity matching for reference points.

| Export                          | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `gpsToH3(lat, lon)`             | Convert GPS coordinates to an H3 cell index      |
| `findNearbyRefPoint(h3, known)` | Find a known reference point near an H3 cell     |
| `H3_RESOLUTION`                 | The H3 resolution used (default: 12, ~10m cells) |

### `utils/` — Logging & Helpers

| Export                                      | Description                                      |
| ------------------------------------------- | ------------------------------------------------ |
| `createLogger(channel)`                     | Create a channeled logger with level control     |
| `computeFusedPath(inputs)`                  | Compute a fused GPS+odometry path                |
| `createFailureTracker(config)`              | Track failure rates with configurable thresholds |
| `mapWithConcurrencyLimit(items, fn, limit)` | Async map with bounded concurrency               |
| `formatFileSize(bytes)`                     | Human-readable file sizes                        |

### `types/` — Shared Type Definitions

AR and GPS type definitions (`DepthPoint`, `DepthSample`, etc.) used across modules.

## Design Principles

1. **No global singletons.** Everything is created via factories and passed explicitly.
2. **Store is the integration point.** All modules communicate through Redux state.
3. **Modules are optional.** Use `initAR` without `LeafletMapOverlay`. No forced coupling.
4. **Swappable implementations.** The `StorageBackend` interface lets you replace OPFS with IndexedDB or a custom backend.

## Development

```bash
cd GpsPlusSlamJs_AppFramework
npm install
npm test          # format + lint + typecheck + unit tests
npm run build     # build with tsdown
```

### Project Structure

```
src/
├── ar/             # WebXR session, capture, replay scene
├── sensors/        # GPS, orientation, permissions
├── state/          # Redux store, recording coordinator, replay
├── storage/        # OPFS, ZIP, file system, ref-point persistence
├── ref-points/     # H3 spatial indexing
├── visualization/  # Three.js markers, maps, camera helpers
├── utils/          # Logger, concurrency, formatters
├── types/          # Shared type definitions
└── test-utils/     # Test helpers (browser mocks, ZIP helpers)
```

## License

This framework is licensed under **Apache 2.0** — see [LICENSE](LICENSE).

> **Note:** This package depends on [gps-plus-slam-js](../GpsPlusSlamJs/), which is a **closed-source, proprietary** library distributed via npm under a separate license. A community license key is included in the open-source apps for frictionless development. See the core library's EULA for usage terms.

## See Also

- [gps-plus-slam-js](../GpsPlusSlamJs/) — Core alignment algorithms (closed-source, UNLICENSED)
- [Recorder App](../GpsPlusSlamJs_RecorderApp/) — Full-featured recording app built on this framework
