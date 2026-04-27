# Session Summary E2E Tests

## Purpose

End-to-end tests for the Session Summary panel that appears after recording stops. These tests verify the user-facing behavior of the SUMMARY terminal state.

## Test Categories

| Category        | # Tests | Description                                     |
| --------------- | ------- | ----------------------------------------------- |
| Visibility      | 2       | Panel hidden by default, visible when triggered |
| Content Display | 10      | All data fields rendered correctly              |
| Error Display   | 2       | Error list and "No errors" state                |
| Edge Cases      | 2       | Zero GPS data, zero duration                    |
| Buttons         | 4       | Button visibility and styling                   |
| Styling         | 4       | Overlay styling, z-index, color accents         |
| Terminal State  | 2       | Panel overlays viewport, obscures controls      |

## Test Hooks Used

- `window.testHooks.showSessionSummary(data)` - Triggers summary display
- `window.testHooks.showRecordingControls()` - For verifying overlay behavior

## Running Tests

```bash
# Run only session summary tests
npm run test:e2e -- --grep "Session Summary"

# Run all E2E tests
npm run test:e2e
```

## Sample Test Data

```javascript
const sampleSummaryData = {
  duration: { startTime: Date.now() - 60000, endTime: Date.now() },
  gpsEventCount: 42,
  refPointCount: 3,
  imageCount: 15,
  depthSampleCount: 60,
  errors: [],
  firstGps: { lat: 50.0, lng: 8.0 },
  lastGps: { lat: 50.001, lng: 8.001 },
  totalDistanceMeters: 150.5,
};
```

## Related Files

- [session-summary.ts](../src/ui/session-summary.ts) - Component implementation
- [session-summary.test.ts](../src/ui/session-summary.test.ts) - Unit tests
- [index.html](../index.html) - HTML markup for the panel
- [test-hooks-verification.spec.js](test-hooks-verification.spec.js) - Verifies all testHooks are documented
