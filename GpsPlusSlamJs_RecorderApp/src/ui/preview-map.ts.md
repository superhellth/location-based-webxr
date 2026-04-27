# preview-map.ts

## Purpose

Lightweight Leaflet-based 2D map for the replay setup screen. Displays a raw GPS path (yellow polyline) when a recording session is selected, so the user can preview where the recording took place before starting replay.

## Public API

| Export                                 | Type                                                                 | Description                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `createPreviewMap(container, gpsPath)` | `(HTMLElement \| null, GpsPathCoord[]) → PreviewMapInstance \| null` | Creates a Leaflet map with a yellow polyline. Returns `null` if container is null or gpsPath is empty. |
| `PreviewMapInstance`                   | interface                                                            | `{ destroy(): void }` — call to remove the Leaflet map and release resources. Idempotent.              |
| `GpsPathCoord`                         | type (re-export)                                                     | `{ lat: number; lng: number }` from `zip-reader.ts`                                                    |

## Invariants & Assumptions

- Container must be a visible DOM element with dimensions for Leaflet to render correctly.
- Map auto-fits bounds to the GPS path with 20px padding.
- A deferred `invalidateSize()` call runs at 200ms to handle containers that were hidden at creation time.
- `destroy()` is idempotent — safe to call multiple times.
- Uses the same yellow color (`VIS_COLORS.RAW_GPS.css = '#ffff00'`) as the summary map's raw GPS polyline.
- OSM tiles with attribution, max zoom 19.

## Examples

```typescript
import { createPreviewMap } from './preview-map';

const container = document.getElementById('replay-preview-map');
const gpsPath = [
  { lat: 50.0, lng: 8.0 },
  { lat: 50.001, lng: 8.001 },
];

const map = createPreviewMap(container, gpsPath);
// ... later, when switching sessions:
map?.destroy();
```

## Tests

- [preview-map.test.ts](preview-map.test.ts) — 10 unit tests covering: null container, empty path, map creation, tile layer, polyline rendering (color/weight/opacity), bounds fitting, destroy/idempotent destroy, resize invalidation, single-point edge case.
