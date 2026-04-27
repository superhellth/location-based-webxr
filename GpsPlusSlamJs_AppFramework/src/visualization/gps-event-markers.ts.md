# gps-event-markers.ts

## Purpose

Visualizes GPS events as 3D markers during recording and replay. Shows three types of markers:

- **Raw GPS markers (yellow)**: Added to scene root at GPS world-space coordinates; fixed forever.
- **Fused markers (cyan)**: Added to `arWorldGroup` at raw odometry coordinates. Scene-graph propagation (`arWorldGroup.matrix × odomPos`) automatically produces the correct world-space fused position when the alignment matrix changes.
- **Alignment snapshot markers (red)**: Added to scene root at $A_k \cdot p_k$ (alignment × odom at update $k$). Frozen historical beliefs — never moved retroactively.

## Public API

### Types

| Type                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `GpsEventVisualizer` | Class that manages GPS event marker visualization |

### GpsEventVisualizer Class

| Method                          | Signature                                        | Description                                        |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `setZeroRef`                    | `(zero: LatLong) => void`                        | Set GPS origin for coordinate conversion           |
| `getZeroRef`                    | `() => LatLong \| null`                          | Get current GPS origin                             |
| `addGpsEvent`                   | `(gpsCoords: [x,y,z], odomPos: [x,y,z]) => void` | Add markers for a GPS event                        |
| `addAlignmentSnapshot`          | `(nuePosition: readonly number[]) => void`       | Add a red snapshot sphere at scene root            |
| `getAlignmentSnapshotPositions` | `() => number[][]`                               | Return positions of all snapshot markers as arrays |
| `clearAll`                      | `() => void`                                     | Remove all markers (including snapshots) and reset |
| `getCounts`                     | `() => { raw, fused, snapshots }`                | Get marker counts including alignment snapshots    |

### Exported Singleton

```typescript
export const gpsEventVisualizer: GpsEventVisualizer;
```

## Invariants & Assumptions

1. **Zero reference must be set** before adding GPS events
2. **Scene must be available** (from `getScene()`) for raw GPS markers to be created
3. **arWorldGroup must be available** (from `getArWorldGroup()`) for fused markers; if unavailable, only raw GPS marker is created
4. **Raw GPS markers are immutable** — they never move after creation (scene root)
5. **Fused markers move automatically** when `applyAlignmentMatrix()` updates `arWorldGroup.matrix` — no manual repositioning needed
6. **No gl-matrix dependency** — alignment is handled entirely by Three.js scene-graph propagation

## Color Coding

| Marker Type        | Color  | Hex        | Parent         | Description                                                        |
| ------------------ | ------ | ---------- | -------------- | ------------------------------------------------------------------ |
| Raw GPS            | Yellow | `0xffff00` | scene root     | Where GPS readings were received (noisy)                           |
| Fused              | Cyan   | `0x00ffff` | `arWorldGroup` | AR odometry; alignment applied via scene-graph                     |
| Alignment Snapshot | Red    | `0xff0000` | scene root     | Frozen historical belief at alignment update $k$ ($A_k \cdot p_k$) |

## Marker Sizing

- Radius: **8cm (0.08m)** — smaller than reference point markers (10cm)
- Geometry: SphereGeometry with 12 segments
- Material: MeshBasicMaterial, transparent (opacity 0.3), depthWrite disabled

## Examples

### Basic Usage

```typescript
import { gpsEventVisualizer } from './visualization/gps-event-markers';

// 1. Set zero reference when first GPS arrives
gpsEventVisualizer.setZeroRef({ lat: 48.8566, lon: 2.3522 });

// 2. Add GPS event (coordinates in meters from zero)
gpsEventVisualizer.addGpsEvent([10.5, 2.3, 15.2], [1.0, 0.5, 2.0]);

// 3. No updateAlignment needed — applyAlignmentMatrix() in webxr-session.ts
//    updates arWorldGroup.matrix, and all fused markers move automatically.

// 4. Cleanup when recording stops
gpsEventVisualizer.clearAll();
```

### Integration with Store

```typescript
// Via wireStoreSubscribers() from src/state/store-subscribers.ts
unsubscribeStore = wireStoreSubscribers(store, {
  applyAlignmentMatrix,
  gpsEventVisualizer,
  mapOverlay,
});
```

## Tests

Unit tests in `gps-event-markers.test.ts`:

| Test Suite              | Tests | Purpose                                          |
| ----------------------- | ----- | ------------------------------------------------ |
| setZeroRef / getZeroRef | 1     | Verify zero reference storage                    |
| addGpsEvent             | 6     | Marker creation, colors, placement, guard checks |
| scene-graph propagation | 3     | World position via arWorldGroup.matrix           |
| clearAll                | 3     | Cleanup and disposal                             |
| getCounts               | 2     | Counter functionality                            |
| marker sizing           | 1     | Verify 8cm radius                                |
| marker transparency     | 4     | Opacity and depthWrite settings                  |

## Architecture

```
Scene (GPS World Space)
├── ar-world (arWorldGroup — receives alignment matrix)
│   ├── fused-0 (cyan sphere at raw odom [1, 0.5, 2])
│   ├── fused-1 (cyan sphere at raw odom [2, 0.8, 4])
│   └── ...
├── raw-gps-0 (yellow sphere at GPS world coords)
├── raw-gps-1 (yellow sphere)
└── ...
```

Raw GPS markers show scatter/noise from GPS readings.
Fused markers show the stable AR-tracked path after alignment.
The visual difference between them demonstrates alignment quality.
