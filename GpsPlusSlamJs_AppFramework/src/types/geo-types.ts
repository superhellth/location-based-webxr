/**
 * Shared Geo Types
 *
 * Canonical definitions for Leaflet-convention GPS coordinate types
 * (uses `lng`, NOT `lon`). Consolidates formerly duplicated interfaces
 * from fused-path.ts and summary-map.ts, and replaces inline
 * `{ lat: number; lng: number }` shapes across the codebase.
 *
 * NOTE: The library (`gps-plus-slam-js`) exports `LatLong` which uses
 * `lon` (not `lng`). These two types are intentionally distinct —
 * `GpsCoord` uses Leaflet's `lng` convention for UI/map code.
 *
 * @see 2026-03-03-code-review-inline-type-duplication.md Finding #3
 */

/** A GPS coordinate using the Leaflet convention (lat/lng). */
export interface GpsCoord {
  readonly lat: number;
  readonly lng: number;
}

/**
 * A reference point with GPS location and a human-readable name.
 * Extends GpsCoord so it is usable wherever GpsCoord is expected.
 */
export interface RefPointMarker extends GpsCoord {
  readonly name: string;
}
