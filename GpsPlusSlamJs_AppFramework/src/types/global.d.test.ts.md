# global.d.test.ts

Type-level regression tests for `Window` interface extensions in `global.d.ts`.

## Purpose

Validates that the `Window` interface extensions declared in [global.d.ts](global.d.ts) correctly match the actual function signatures exported from [hud.ts](../ui/hud.ts) and [ref-point-picker.ts](../ui/ref-point-picker.ts). If someone accidentally changes function signatures without updating `global.d.ts`, TypeScript will catch the mismatch at compile time through these type assertions.

## Strategy

**Type-regression via compile-time assertions with Vitest guard noted.**

These tests use TypeScript's structural typing to verify that imported functions satisfy the declared `Window` interface contracts. The tests:

1. Create objects typed as `Window['testHooks']` or `Window['refPointPickerApi']`
2. Assign actual exported functions to those objects
3. TypeScript fails at compile time if signatures diverge

Runtime assertions (`expect(typeof fn).toBe('function')`) provide a secondary check and satisfy Vitest's expectation requirements.

## Tests

### testHooks type compatibility

| Test                                                        | Purpose                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `should have correct function signatures that match hud.ts` | Verifies all 6 hud functions match `Window.testHooks` types |

### refPointPickerApi type compatibility

| Test                                                                      | Purpose                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `should have correct function signature that matches ref-point-picker.ts` | Verifies `showRefPointPicker` matches declared signature         |
| `should return Promise<RefPointPickerResult \| null>`                     | Type-level check for correct return type using conditional types |

### Window properties are optional

| Test                                                        | Purpose                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `testHooks should be optional (undefined is valid)`         | Ensures `testHooks?` is correctly marked as optional         |
| `refPointPickerApi should be optional (undefined is valid)` | Ensures `refPointPickerApi?` is correctly marked as optional |

## Covered Function Signatures

### testHooks (from hud.ts)

- `populateScenarios: (scenarios: string[]) => void`
- `validateEnterButton: () => void`
- `showRecordingControls: () => void`
- `hideRecordingControls: () => void`
- `updateGpsInfo: (accuracy: number) => void`
- `updateArInfo: (tracking: string) => void`

### refPointPickerApi (from ref-point-picker.ts)

- `showRefPointPicker: (existingIds: string[]) => Promise<RefPointPickerResult | null>`

## Important Invariants

1. **Optional properties**: Both `testHooks` and `refPointPickerApi` are optional (`?`) on `Window` since they are only assigned at runtime in dev mode.
2. **Type equality**: The test uses bidirectional conditional type checks (`ActualReturn extends ExpectedReturn ? ExpectedReturn extends ActualReturn ? true : false : false`) to ensure exact type matching, not just assignability.

## Why Runtime Assignment Is Skipped

The actual `window.testHooks` assignment in the application is guarded by `!import.meta.env.VITEST` to avoid side effects during unit tests. This means:

- Unit tests cannot verify the runtime assignment itself
- E2E tests in `playwright-tests/` cover the runtime behavior where the hooks are actually attached to `window`

## E2E Runtime Coverage

Playwright E2E tests exercise the real `window.testHooks` and `window.refPointPickerApi` objects in a browser environment, validating that:

1. The hooks are correctly assigned in dev mode
2. The functions work as expected when called via the window object
3. The type declarations match actual runtime behavior
