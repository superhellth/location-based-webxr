# fused-path.ts

## Purpose

Transforms AR odometry positions into GPS coordinates using the alignment matrix. This enables displaying the "fused" SLAM+GPS trajectory (cyan polyline) on the session summary map alongside the raw GPS path (yellow polyline).

## Public API

### `computeFusedPath(input: FusedPathInput): GpsCoord[]`

Transforms odometry positions from AR-local coordinates to GPS lat/lng.

**Parameters:**

- `odometryPositions: Vector3[]` — Odometry positions in AR-local coordinates (from `gpsEvents.odometryPositions`)
- `alignmentMatrix: Matrix4 | null` — The 4x4 alignment matrix from the solver (from `gpsEvents.alignmentMatrix`)
- `zeroRef: LatLong | null` — GPS origin point for ENU conversion (from `gpsEvents.gpsPositions[0].zeroRef`)

**Returns:** Array of `{ lat: number; lng: number }` suitable for Leaflet polyline.

**Edge cases:**

- Returns `[]` if any input is null/empty
- Uses `lng` (not `lon`) for Leaflet compatibility

### `fusedGpsFromOdom(alignmentMatrix: Matrix4, odomPosition: Vector3, zeroRef: LatLongAlt): LatLongAlt`

Re-exported from `gps-plus-slam-js` core library. Single-point version of the alignment→GPS pipeline. Transforms one AR odometry position to GPS coordinates.

The implementation was moved to the core library (IP audit §4.3) since it directly implements the alignment output computation. This module re-exports it for backward compatibility.

Used by `ref-point-handlers` (fusedGpsPoint at mark time), `store-subscribers` (fused point on map), and can replace inline mat4/vec3/calcGpsCoords boilerplate wherever a single odom→GPS transformation is needed.

**Returns:** `{ lat, lon }` (library `LatLong` type, uses `lon` not `lng`).

### Types

```typescript
// Imported from gps-plus-slam-js library
import type { Vector3, Matrix4, LatLong } from 'gps-plus-slam-js';
export type { GpsCoord } from '../types/geo-types'; // re-exported
export interface FusedPathInput {
  odometryPositions: ReadonlyArray<Vector3>;
  alignmentMatrix: Matrix4 | null;
  zeroRef: LatLong | null;
}
```

## Invariants & Assumptions

1. **Coordinate system:** Odometry is in AR-local coordinates. The alignment matrix transforms to ENU (East-North-Up) meters relative to `zeroRef`.
2. **Matrix format:** The alignment matrix is a 16-element tuple in column-major order (gl-matrix convention).
3. **ENU convention:** East = X, Up = Y, North = Z (matches library's `calcGpsCoords`).
4. **Leaflet naming:** Output uses `lng` property, not `lon`, for Leaflet compatibility.

## Examples

```typescript
import { computeFusedPath } from './fused-path';

// Get data from store after recording
const gpsEvents = store.getState().gpsData?.gpsEvents;
const firstGps = gpsEvents?.gpsPositions[0];

const fusedPath = computeFusedPath({
  odometryPositions: gpsEvents?.odometryPositions ?? [],
  alignmentMatrix: gpsEvents?.alignmentMatrix ?? null,
  zeroRef: firstGps?.zeroRef ?? null,
});

// Use in session summary
showSessionSummary({
  rawGpsPath: [...],
  fusedPath: fusedPath,  // Cyan polyline on Leaflet map
  referencePointsForMap: [...],
});
```

## Tests

Unit tests in [fused-path.test.ts](./fused-path.test.ts):

- **Basic functionality:** Empty inputs, null matrix, null zeroRef all return `[]`
- **Identity transformation:** Odometry at origin returns zeroRef coordinates
- **Translation transformation:** Validates matrix translation is applied correctly
- **Output format:** Confirms `lat` and `lng` properties (not `lon`)
- **Type safety:** Handles Vector3 arrays correctly
- **fusedGpsFromOdom:** Identity transform, translation, consistency with `computeFusedPath` for single point

All tests are deterministic and fast (~8ms total). 16 tests.

## Dependencies

- `gl-matrix` — Matrix and vector math
- `gps-plus-slam-js` — `calcGpsCoords` for ENU→GPS conversion, `LatLong` type
