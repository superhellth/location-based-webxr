# geo-types.ts

## Purpose

Canonical shared definitions for Leaflet-convention GPS coordinate types (`lng`, NOT `lon`). Consolidates formerly duplicated `GpsCoord` interfaces from `fused-path.ts` and `summary-map.ts`, and replaces inline `{ lat: number; lng: number }` shapes across the codebase.

**Code Review Reference:** Finding #3 in `docs/2026-03-03-code-review-inline-type-duplication.md`.

## Public API

### `GpsCoord`

```typescript
export interface GpsCoord {
  readonly lat: number;
  readonly lng: number;
}
```

A GPS coordinate using the **Leaflet convention** (`lng`, not `lon`). Properties are `readonly` to prevent accidental mutation of coordinate data. This is distinct from the library's `LatLong` type which uses `lon`.

### `RefPointMarker`

```typescript
export interface RefPointMarker extends GpsCoord {
  name: string;
}
```

A reference point with GPS location and a human-readable name. Extends `GpsCoord` so it is usable anywhere `GpsCoord` is expected.

## Invariants & Assumptions

1. **Leaflet naming convention:** Uses `lng` (not `lon`) to be directly compatible with Leaflet's `L.LatLng` API.
2. **Distinct from `LatLong`:** The library (`gps-plus-slam-js`) exports `LatLong` with `lon`. Do NOT merge these types — they serve different conventions.
3. **Sub-type relationship:** `RefPointMarker` is a subtype of `GpsCoord` via `extends`, so any `RefPointMarker` can be used where `GpsCoord` is expected.

## Examples

```typescript
import type { GpsCoord, RefPointMarker } from '../types/geo-types';

const point: GpsCoord = { lat: 50.0, lng: 8.0 };
const marker: RefPointMarker = { lat: 50.0, lng: 8.0, name: 'Gate A' };

// RefPointMarker is assignable to GpsCoord
const coord: GpsCoord = marker; // OK
```

## Tests

Unit tests in [geo-types.test.ts](./geo-types.test.ts):

- **Structural contract:** `GpsCoord` has `lat` and `lng` number fields
- **Assignability:** `GpsCoord` is assignable to/from inline `{ lat: number; lng: number }`
- **Immutability:** `GpsCoord` properties are `readonly` (type-level assertion via `expectTypeOf`)
- **Sub-type:** `RefPointMarker` extends `GpsCoord` with a `name` field
- **Assignability:** `RefPointMarker` is assignable to `GpsCoord`

All tests verify compile-time type contracts and are deterministic and fast.
