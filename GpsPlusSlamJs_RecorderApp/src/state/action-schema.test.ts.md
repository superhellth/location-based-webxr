# action-schema.test.ts

## Purpose

Validates that recorded Redux actions have the expected structure for replay compatibility with the GpsPlusSlamJs library.

## Test Cases

| Test                                                              | Description                              |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `startSession action has correct type and payload`                | Verify session metadata action shape     |
| `setZeroPos action sets the zero reference position`              | GPS zero reference (library action)      |
| `recordGpsEvent action has correct structure with library format` | Paired AR+GPS data (library action)      |
| `recordGpsEvent should include weight based on accuracy`          | Weight computation for alignment solver  |
| `add2dImage action has correct structure for reference points`    | Image/ref point capture (library action) |
| `recordDepthSample action has correct structure with camera pose` | Depth sensing samples (recorder action)  |
| `recordDepthSample should be JSON-serializable for replay`        | Depth data serialization                 |
| `all actions should be JSON-serializable`                         | General serialization validation         |

## Why These Tests Matter

The Recorder App generates action files that the library's `replayLoader` must parse. These tests ensure:

1. **Action type strings** match expected patterns (`gpsData/xxx` for library, `recorder/xxx` for app)
2. **Payload structure** is consistent and complete
3. **Serialization** works correctly (no functions, circular refs)

## Test Strategy

- Creates actions via action creators
- Inspects resulting action object shape
- Verifies actions are persisted via mocked `writeAction`

## Relationship to Library

The library's `src/utils/replayLoader.ts` expects specific action formats. Changes here must be coordinated with the library.
