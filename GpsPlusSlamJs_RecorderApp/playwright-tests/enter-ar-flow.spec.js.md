# enter-ar-flow.spec.js

## Purpose

End-to-end Playwright tests verifying the complete "Enter AR" flow from the setup modal to AR mode. These tests address user feedback about unclear button states and missing visual hints when the Enter AR button is disabled.

See [docs/2026-01-23-user-feedback.md](../../GpsPlusSlamJs_Docs/docs/2026-01-23-user-feedback.md) for the original user reports that motivated this test suite.

## Public Testing API

### Imports & Fixtures

```javascript
import { test, expect } from '@playwright/test';
```

- **`test`** – Playwright's test runner; provides `beforeEach`, `describe`, and individual test blocks.
- **`expect`** – Playwright's assertion library for checking element visibility, state, text, and focus.

### Test Hooks (window.testHooks)

The tests use `window.testHooks.populateScenarios(scenarios)` exposed by the app to programmatically populate the scenario dropdown without requiring actual file-system access. This allows testing UI states in isolation.

### Helper Functions

| Function                                     | Parameters                                     | Description                                                                                    |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `callRealPopulateScenarios(page, scenarios)` | `page`: Playwright Page, `scenarios`: string[] | Waits for testHooks availability, then calls `populateScenarios` with the given scenario names |

## Invariants & Assertions

The tests verify the following invariants:

### Permission Verification

1. **Permission status section visible** – All required permissions (File Storage, AR, GPS, Camera, Compass) are shown.
2. **File Storage shown first** – User Feedback Issue #1: File storage is the first permission item since it's the most common failure point.
3. **File Storage pending before folder selection** – Shows "⏳ Pending" until a folder is selected.
4. **File Storage granted after successful folder selection** – Shows "✅ Ready" when folder with write access is selected.
5. **File Storage denied for read-only folders** – Shows "❌ Denied" with error message when write verification fails.
6. **WebXR depth sensing label** – Shows "AR + Depth Sensing" to clarify the "3D map" permission.
7. **Grant Permissions button visible when pending** – Button appears when any permission needs requesting.
8. **Denied permissions show errors** – Clear error messages for each denied permission.

### Enter AR Button Flow

1. **Enter AR button disabled before folder selection** – A hint (`#enter-ar-hint`) is visible explaining "Select a folder".
2. **Enter AR button disabled when new scenario selected but name empty** – Hint shows "Enter a scenario name".
3. **Hint hides when button becomes enabled** – No visual clutter once requirements are met.
4. **Auto-focus on new scenario input** – When "+ Create new scenario" is selected, `#new-scenario-name` receives focus.
5. **Button state updates dynamically** – Enabling/disabling as user types or clears the scenario name.
6. **Clicking enabled Enter AR hides setup modal** – The happy path works end-to-end.
7. **Empty folder bug fix** – When a folder has no existing scenarios, the new scenario section is visible and focused immediately.

### Key DOM Elements Tested

| Selector                   | Role                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `#setup-modal`             | Setup modal container; should be visible on load, hidden after Enter AR |
| `#btn-enter-ar`            | Enter AR button; disabled/enabled based on state                        |
| `#enter-ar-hint`           | Hint text explaining why button is disabled                             |
| `#permission-section`      | Container for permission status indicators                              |
| `#perm-filestorage`        | File Storage permission row (first position)                            |
| `#perm-filestorage-status` | File Storage status text                                                |
| `#perm-webxr`              | WebXR/AR permission row                                                 |
| `#perm-gps`                | Geolocation permission row                                              |
| `#perm-camera`             | Camera permission row                                                   |
| `#perm-orientation`        | Device orientation permission row                                       |
| `#permission-error`        | Error message for denied permissions                                    |
| `#scenario-select`         | Dropdown for selecting existing or new scenario                         |
| `#new-scenario-section`    | Container for new scenario input; shown when "**new**" selected         |
| `#new-scenario-name`       | Text input for new scenario name                                        |

## Example Test Scenarios

### 1. Disabled button with hint (no folder selected)

```javascript
test('shows hint text when Enter AR button is disabled before folder selection', async ({
  page,
}) => {
  const enterButton = page.locator('#btn-enter-ar');
  await expect(enterButton).toBeDisabled();

  const hint = page.locator('#enter-ar-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Select a folder');
});
```

### 2. Complete happy path

```javascript
test('clicking enabled Enter AR button hides setup modal', async ({ page }) => {
  await callRealPopulateScenarios(page, ['TestScenario']);
  await page.locator('#scenario-select').selectOption('TestScenario');
  await page.locator('#btn-enter-ar').click();
  await expect(page.locator('#setup-modal')).toHaveClass(/hidden/);
});
```

## Test Strategy

### Setup (beforeEach)

1. Navigate to `/` (app root).
2. Wait for `#setup-modal` to be visible, confirming the app is ready.

### Teardown

Playwright handles page cleanup automatically between tests.

### Preconditions

- App must expose `window.testHooks.populateScenarios` for programmatic scenario injection.
- The setup modal must be the initial view on load.

### How to Run

```bash
cd GpsPlusSlamJs_RecorderApp
npm run test:e2e
```

To run only this spec:

```bash
npm run test:e2e -- playwright-tests/enter-ar-flow.spec.js
```

### Reproducing Verified Behaviors

1. **Disabled button hint** – Load the app without selecting a folder; observe the hint.
2. **New scenario flow** – Select a folder with no scenarios; verify input is visible and focused.
3. **Dynamic button state** – Type a scenario name, then clear it; observe button toggling.
4. **Happy path** – Select an existing scenario and click Enter AR; modal should hide.

## Rationale

Users reported confusion about the Enter AR button being disabled without explanation. These tests codify the expected UX improvements:

- Clear visual feedback via hints
- Logical focus management for keyboard navigation
- Responsive button states that update as requirements are met
- Proper handling of edge cases (empty folders)

Without these tests, regressions in the setup flow could silently degrade user experience.
