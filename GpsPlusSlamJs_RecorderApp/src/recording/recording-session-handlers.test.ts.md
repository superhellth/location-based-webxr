# Recording Session Handlers Tests

## Purpose

Verifies the recording-session handler factory preserves the intended lifecycle behavior from `main.ts` while remaining isolated from real browser, storage, sensor, and UI integrations.

## Test Surface

- Factory shape and session-name accessors.
- `handleStartRecording()` orchestration: store replacement, storage init, subscribers, watches, capture options, sync-manager startup, and HUD state.
- `handleStopRecording()` cleanup and summary behavior: metadata write, best-effort build metadata, sanitized page URL capture, final sync/ZIP export, tracker collection, and summary payload construction.
- `handleBackDuringRecording()` confirmation flow and concurrency guard.
- `cleanupForNewRecording()` and `reset()` teardown paths.
- Null-safe tracker proxy methods before and after tracker creation.

## Invariants & Assumptions

- All external modules are mocked so the tests assert orchestration, not implementation details of dependencies.
- Global mutations must be restored after each test. This file uses `vi.stubGlobal()` with `vi.unstubAllGlobals()` so browser globals like `location` cannot leak across cases.
- The test store is intentionally minimal and only implements the members used by `recording-session-handlers.ts`.

## Examples

```typescript
vi.stubGlobal('location', {
  href: 'https://example.com/recorder?scenario=test&token=secret#debug-panel',
});

await handlers.handleStopRecording();

expect(mockStore.writeSessionMetadata).toHaveBeenCalledWith(
  expect.objectContaining({
    pageUrl: 'https://example.com/recorder',
  })
);
```

## Tests

- `recording-session-handlers.test.ts` is the executable spec for this module.
- Related production behavior is documented in `recording-session-handlers.ts.md`.
