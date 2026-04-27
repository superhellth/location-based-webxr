# main.test.ts

## Purpose

Unit tests for the main application coordinator module, specifically testing scenario name state management.

## Test Coverage

| Test                                                                      | Description                       |
| ------------------------------------------------------------------------- | --------------------------------- |
| `should update currentScenarioName when setCurrentScenarioName is called` | Verifies basic setter works       |
| `should reset currentScenarioName to empty string`                        | Verifies reset for test isolation |
| `should persist the last selected scenario name`                          | Verifies multiple changes work    |
| `should update currentScenarioName when handleScenarioChange is called`   | **Issue #7 regression test**      |

## Why These Tests Matter

The main module coordinates UI events with recording state. When a user selects a scenario from the dropdown, `handleScenarioChange()` is called. This must update `currentScenarioName` so that when `handleStartRecording()` runs, it uses the correct scenario instead of the fallback `'Default Scenario'`.

## Mocking Strategy

The test mocks external dependencies to isolate the state management:

- `./storage/file-system` - Mocked to avoid file system operations
- `./storage/ref-point-loader` - Mocked to avoid loading ref points
- `./visualization/reference-points` - Mocked to avoid Three.js
- `./ui/hud` - Mocked to avoid DOM manipulation

## Test Isolation

Each test calls `resetMainState()` in `beforeEach`/`afterEach` to ensure tests don't affect each other.
