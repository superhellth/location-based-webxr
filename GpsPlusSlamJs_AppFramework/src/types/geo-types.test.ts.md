# geo-types.test.ts

## Purpose

Verifies the structural contract of shared GPS coordinate types (`GpsCoord`, `RefPointMarker`) from `geo-types.ts`. These tests exist because the types were previously duplicated across `fused-path.ts` and `summary-map.ts` (code-review Finding #3). The tests document the exact shape and assignability guarantees that consumers rely on.

## Tests

| Test                                                                               | What it proves                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------- |
| `GpsCoord` has lat/lng fields                                                      | Structural correctness (Leaflet convention) |
| `GpsCoord` assignable from `{ lat, lng }` literal                                  | No extra required fields                    |
| `GpsCoord` assignable to inline `{ lat: number; lng: number }`                     | Drop-in replacement for inline usages       |
| `GpsCoord` has readonly properties                                                 | Prevents accidental coordinate mutation     |
| `RefPointMarker` has lat/lng/name                                                  | Extends GpsCoord correctly                  |
| `RefPointMarker` assignable to `GpsCoord`                                          | Sub-type relationship holds                 |
| `RefPointMarker` assignable to inline `{ lat: number; lng: number; name: string }` | Drop-in for session-summary inline shape    |
