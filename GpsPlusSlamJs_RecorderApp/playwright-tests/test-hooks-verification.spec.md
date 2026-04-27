# test-hooks-verification.spec.js

## Purpose

End-to-end tests verifying that `window.testHooks` functions produce the same observable outcomes as real user interactions. This guards against test hooks diverging from actual application behavior—if they diverge, e2e tests could pass while real users experience bugs.

## Test Hook Functions Exercised

| Hook                    | Signature                    | Description                                                                          |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| `populateScenarios`     | `(names: string[]) => void`  | Populates the scenario dropdown with given scenario names plus a "Create new" option |
| `showRecordingControls` | `() => void`                 | Shows stop/reference buttons, hides start button (recording active state)            |
| `hideRecordingControls` | `() => void`                 | Hides stop/reference buttons, shows start button (idle state)                        |
| `updateGpsInfo`         | `(accuracy: number) => void` | Displays GPS info panel with formatted accuracy (e.g., `±5.5m`)                      |
| `updateArInfo`          | `(status: string) => void`   | Displays AR tracking status text                                                     |
| `validateEnterButton`   | `() => void`                 | Enables/disables the Enter AR button based on current form state                     |

### Helper Function

```js
async function waitForTestHooks(page) {
  await page.waitForFunction(
    () =>
      window.testHooks?.populateScenarios &&
      window.testHooks?.showRecordingControls &&
        // ... all hooks checked
        { timeout: 5000 }
  );
}
```

Waits until all test hooks are attached to `window.testHooks` before proceeding.

## Usage Examples

### Populating Scenarios

```js
await page.evaluate(() => {
  window.testHooks.populateScenarios(['Scenario A', 'Scenario B']);
});
// Dropdown now has: "+ Create new scenario", "Scenario A", "Scenario B"
// First existing scenario is auto-selected
```

### Toggling Recording Controls

```js
// Start recording → show stop/ref buttons
await page.evaluate(() => window.testHooks.showRecordingControls());

// Stop recording → restore start button
await page.evaluate(() => window.testHooks.hideRecordingControls());
```

### Updating GPS/AR Info

```js
// Display GPS accuracy (color-coded by quality)
await page.evaluate(() => window.testHooks.updateGpsInfo(5.5));
// Shows "±5.5m" with green color (good accuracy < 10m)

// Display AR tracking status
await page.evaluate(() => window.testHooks.updateArInfo('normal'));
```

### Validating Enter Button

```js
await page.evaluate(() => window.testHooks.populateScenarios(['Existing']));
await page.locator('#scenario-select').selectOption('Existing');
await page.evaluate(() => window.testHooks.validateEnterButton());
// Button is now enabled (valid folder + existing scenario)
```

## Invariants & Assertions

### `populateScenarios`

- Dropdown becomes enabled
- Option count = 1 ("+ Create new scenario") + N scenarios
- First existing scenario is auto-selected (not the "new" placeholder)
- Option text matches provided names exactly

### `showRecordingControls` / `hideRecordingControls`

- `#btn-start`: visible when idle, hidden when recording
- `#btn-stop`: hidden when idle, visible when recording
- `#btn-ref-point`: hidden when idle, visible when recording
- Toggling show→hide restores initial (idle) state

### `updateGpsInfo`

- `#gps-info` panel becomes visible
- `#gps-accuracy` displays formatted string `±{accuracy}m`
- Good accuracy (<10m) applies `text-green-400` class

### `updateArInfo`

- `#ar-info` becomes visible
- Contains the provided status text

### `validateEnterButton`

- **Disabled** when: no folder selected, or "new scenario" chosen with empty name
- **Enabled** when: folder selected AND (existing scenario chosen OR new scenario has non-empty name)

### Hook Coverage

- All hooks exposed on `window.testHooks` must be waited for in `waitForTestHooks()`
- The final test cross-checks exposed hooks vs. expected hooks to catch drift

## Testing Strategy

### Sync with Real User Flows

Each test hook wraps real UI manipulation code. Tests here verify that calling the hook produces the same DOM/state as if a user performed the equivalent action. This ensures our e2e tests using hooks remain valid proxies for real behavior.

### When to Update This Document

1. **New hook added**: Add to the table, provide usage example, document invariants
2. **Hook signature changes**: Update the table and examples
3. **New assertions added**: Add to the invariants section
4. **Hook removed**: Remove from all sections, verify `waitForTestHooks` is updated

### Related Files

- `src/main.ts` — defines `window.testHooks` and underlying UI functions
- `GpsPlusSlamJs_Docs/docs/2026-01-23-e2e-test-problems.md` — background on why this verification suite exists

## Tests

This file is itself a test suite. Run with:

```bash
cd GpsPlusSlamJs_RecorderApp
npm run test:e2e -- playwright-tests/test-hooks-verification.spec.js
```
