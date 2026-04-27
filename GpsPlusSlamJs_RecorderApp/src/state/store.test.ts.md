# store.test.ts

## Purpose

Unit tests for the Redux store state transitions, action creators, action persistence, write failure tracking, StorageBackend injection, and A1 writeFrame/writeSessionMetadata delegation.

## Test Groups

| Group                                           | Tests | Description                                                           |
| ----------------------------------------------- | ----- | --------------------------------------------------------------------- |
| Recorder State                                  | 3     | Session start/end, default state                                      |
| Library Integration                             | 3     | GPS events, zero position, alignment matrix via library store         |
| Subscriber Notification Optimization            | 3     | Only notify when state actually changes                               |
| Action Persistence                              | 3     | Persist gpsData/recorder actions during recording, 1-based index      |
| Failed Write Tracking                           | 7     | Track failures, callbacks, anti-recursion for recordWriteFailure      |
| StorageBackend injection                        | 4     | Injected backend for actions, GPS, error handling, NullStorageBackend |
| writeFrame/writeSessionMetadata delegation (A1) | 3     | A1 fix — delegates frame/metadata writes to injected StorageBackend   |

## Why These Tests Matter

These tests validate that the Redux reducers correctly update state and that all persistence flows through the `StorageBackend` abstraction. They're critical because:

1. **State drives UI** — Recording controls depend on `isRecording`
2. **Action counting** — Used to track session progress
3. **A1 fix** — `writeFrame` and `writeSessionMetadata` must flow through the StorageBackend so `NullStorageBackend` can suppress writes during replay/testing

## Test Strategy

- Uses `createRecorderStore()` to get fresh store per test
- Mocks `writeAction` to prevent actual file I/O
- Tests state shape after dispatch, not side effects
- Injects mock `StorageBackend` to verify delegation without file-system coupling
