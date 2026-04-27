# vis-colors.ts

## Purpose

Single source of truth for all semantic visualization colors used across Three.js 3D scenes and Leaflet 2D maps.

## Public API

```ts
export const VIS_COLORS: {
  RAW_GPS: { hex: number; css: string }; // Yellow — raw GPS markers
  FUSED_VIO: { hex: number; css: string }; // Cyan — fused VIO markers
  ALIGNMENT_SNAPSHOT: { hex: number; css: string }; // Red — alignment snapshots
  PRIOR_REF_POINT: { hex: number; css: string }; // Green — prior session ref points
  CURRENT_REF_POINT: { hex: number; css: string }; // Red (3D) / light-red (2D)
  COMPASS_NORTH: { hex: number; css: string }; // Red
  COMPASS_EAST: { hex: number; css: string }; // Blue
  COMPASS_SOUTH: { hex: number; css: string }; // Dark red
  COMPASS_WEST: { hex: number; css: string }; // Dark blue
  COMPASS_UP: { hex: number; css: string }; // Green
  USER_POSITION: { hex: number; css: string }; // Blue — user position dot on Leaflet map
};
```

Each entry has `hex` (number, for `THREE.MeshBasicMaterial({ color })`) and `css` (string, for Leaflet/CSS).

## Invariants & assumptions

- `CURRENT_REF_POINT` intentionally uses different 3D/2D shades (bright red in 3D, `#ff6b6b` in 2D for map visibility).
- All other entries have matching hex↔css values (verified by tests).
- Tailwind classes in `index.html` (e.g., `bg-yellow-400`) must be kept in sync manually — they can't import JS constants.

## Consumers

- `gps-event-markers.ts` — `.hex` for 3D markers
- `reference-points.ts` — `.hex` for 3D ref point spheres
- `gps-compass-cubes.ts` — `.hex` for compass direction cubes
- `summary-map.ts` — `.css` re-exported as named constants for Leaflet layers
- `leaflet-map-overlay.ts` — `.css` for user position dot (`USER_POSITION`)

## Tests

- `vis-colors.test.ts` — hex↔css consistency, all keys present (including USER_POSITION), intentional 3D/2D shade difference, USER_POSITION blue color verification
