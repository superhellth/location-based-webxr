# global.d.ts

## Purpose

TypeScript declaration file that extends the global `Window` interface with properties used for E2E testing. This enables type-safe access to test hooks and APIs exposed on `window` without requiring `as unknown as` casts.

## Public API

### Window.testHooks

Optional property containing functions from `ui/hud.ts` and `ui/session-summary.ts` exposed for Playwright E2E tests:

- `populateScenarios(scenarios: string[]): void` - Populate scenario dropdown
- `validateEnterButton(): void` - Enable/disable Enter AR button based on form validity
- `showRecordingControls(): void` - Show Stop button for RECORDING state
- `hideRecordingControls(): void` - Hide recording UI controls
- `showSessionSummary(data: SessionSummaryData): void` - Show session summary panel
- `updateGpsInfo(accuracy: number): void` - Update GPS accuracy display
- `updateArInfo(tracking: string): void` - Update AR tracking status display
- `updatePermissionStatus(result: PermissionCheckResult): void` - Update permission status display
- `setPermissionsReady(ready: boolean): void` - Set permissions ready state

### Window.refPointPickerApi

Optional property containing the reference point picker function:

- `showRefPointPicker(existingIds: string[]): Promise<RefPointPickerResult | null>` - Show the reference point picker modal

## Invariants & Assumptions

- These properties are only assigned in development mode (`import.meta.env.DEV`)
- They are NOT assigned during unit tests (`import.meta.env.VITEST`)
- They are NOT available in production builds
- All properties are marked optional (`?`) since they may not be present

## Examples

```typescript
// In main.ts - assigning test hooks (type-safe, no cast needed)
if (
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  !import.meta.env.VITEST
) {
  window.testHooks = {
    populateScenarios,
    validateEnterButton,
    // ...
  };
}

// In Playwright tests - using test hooks
await page.evaluate(() => {
  window.testHooks?.populateScenarios(['Scenario A', 'Scenario B']);
});
```

## Tests

Type safety is verified by:

- TypeScript compiler (`npm run typecheck`)
- Compile-time type assertions in `src/types/global.d.test.ts`
- E2E tests in `playwright-tests/` that exercise the window properties
