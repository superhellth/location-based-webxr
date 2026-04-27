# log-panel.spec.js

## Purpose

E2E tests for the expandable log panel feature (User Feedback Issue #5). These tests verify that users can view detailed logs during field testing by tapping the status area.

## Test Coverage

| Test Suite          | Tests | Description                                                   |
| ------------------- | ----- | ------------------------------------------------------------- |
| **Visibility**      | 4     | Panel hidden initially, show/hide via click, close button     |
| **Content Display** | 5     | Log entries, tag prefixes, timestamps, level-based styling    |
| **Live Updates**    | 1     | New logs appear in real-time when panel is open               |
| **Integration**     | 1     | "View Logs" button in Session Summary opens panel             |
| **testHooks**       | 5     | showLogPanel, hideLogPanel, toggleLogPanel, logInfo, logError |

**Total: 16 tests**

## Test Hooks Used

These tests rely on `window.testHooks` exposed by main.ts in dev mode:

```javascript
window.testHooks = {
  // ...existing hooks...
  showLogPanel,
  hideLogPanel,
  toggleLogPanel,
  logInfo: (tag, message) => createLogger(tag).info(message),
  logWarn: (tag, message) => createLogger(tag).warn(message),
  logError: (tag, message) => createLogger(tag).error(message),
};
```

## Helper Functions

### `waitForTestHooks(page)`

Waits for the log panel test hooks to be available. Required before calling any `page.evaluate()` that uses these hooks.

### `dismissSetupModal(page)`

Hides the setup modal by adding the `hidden` class. Required for tests that need to click on elements behind the modal (like the status area).

## Notes

- The log panel covers the status area when visible, so the "toggle" test uses the close button instead of clicking status again
- Content display tests use testHooks to inject logs rather than relying on application state
- All tests are independent and can run in any order
