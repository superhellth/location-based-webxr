# test-hooks-verification.spec.js

## Purpose

Verifies that `window.testHooks` functions produce the same observable outcomes as real user interactions. This guards against test hooks diverging from actual application behavior, which could cause e2e tests to pass while real users experience bugs.

## Background

See [docs/2026-01-23-e2e-test-problems.md](../../GpsPlusSlamJs_Docs/docs/2026-01-23-e2e-test-problems.md) for the full context on why this verification is important.

## Tests

| Test                                                                    | Verifies                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| `populateScenarios via testHook matches expected DOM state`             | Dropdown options, auto-selection of first scenario |
| `showRecordingControls via testHook produces correct button visibility` | Start hidden, stop/ref visible                     |
| `hideRecordingControls via testHook restores initial button state`      | Buttons return to initial state                    |
| `updateGpsInfo via testHook displays GPS accuracy correctly`            | Accuracy formatting, color coding                  |
| `updateArInfo via testHook displays AR tracking status`                 | Tracking status text display                       |
| `validateEnterButton via testHook correctly enables/disables button`    | Button enabled when scenario selected              |
| `validateEnterButton disables when new scenario has no name`            | Button disabled until name entered                 |

## Helpers

| Function                 | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `waitForTestHooks(page)` | Waits for all testHooks functions to be available (async initialization) |

## Invariants

- Tests verify observable DOM state after calling testHooks
- Each testHook should produce the same outcome as the equivalent user action
- If these tests fail, it indicates a divergence between testHooks and real behavior

## Related Files

- [../src/main.ts](../src/main.ts) - testHooks definition (lines 934-950)
- [../src/ui/hud.ts](../src/ui/hud.ts) - Source functions exposed via testHooks
- [README.md](README.md) - Testing guidelines
