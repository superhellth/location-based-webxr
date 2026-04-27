# GPS Event Markers E2E Test

## Purpose

Verifies that GPS event visualization test hooks are properly exposed and callable from Playwright. Since WebXR sessions can't run in Playwright, these tests focus on the integration contract rather than actual 3D rendering.

## Test Coverage

| Test                                      | Purpose                                     |
| ----------------------------------------- | ------------------------------------------- |
| test hooks for GPS visualizer are exposed | Confirms all three hooks exist as functions |
| getCounts returns zero initially          | Verifies clean initial state                |
| setZeroRef can be called without error    | Integration wiring doesn't crash            |
| clearGpsEventVisualizer resets state      | Clear functionality works                   |
| getCounts returns correct type structure  | API shape is stable                         |

## What CAN'T Be Tested Here

These are covered by unit tests in `src/visualization/gps-event-markers.test.ts`:

- Three.js mesh creation (requires WebXR scene)
- Marker positioning in 3D space
- Alignment matrix transformations
- Visual appearance (color, size)

## Test Hooks Used

- `window.testHooks.getGpsEventVisualizerCounts()` - Returns `{ raw: number, fused: number }`
- `window.testHooks.setGpsEventVisualizerZeroRef(lat, lng)` - Sets GPS origin
- `window.testHooks.clearGpsEventVisualizer()` - Clears all markers and resets state

## Running

```bash
cd GpsPlusSlamJs_RecorderApp
npm run test:e2e -- playwright-tests/gps-event-markers.spec.js
```
