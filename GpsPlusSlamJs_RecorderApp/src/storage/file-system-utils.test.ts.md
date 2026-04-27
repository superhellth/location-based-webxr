# file-system-utils.test.ts

## Purpose

Unit tests for the pure utility functions in `file-system-utils.ts`.

## Test Cases

| Test                                                | Description            |
| --------------------------------------------------- | ---------------------- |
| `formatTimestamp returns UTC string`                | Verify date formatting |
| `formatActionFilename zero-pads to 6 digits`        | Verify action naming   |
| `formatFrameFilename includes prefix and extension` | Verify frame naming    |
| `formatTimestamp handles midnight correctly`        | Edge case              |

## Why These Tests Matter

These tests ensure consistent file/folder naming across:

1. **Sessions** - Same naming pattern for all recordings
2. **Platforms** - UTC timestamps avoid timezone issues
3. **Sorting** - Zero-padded indices sort correctly

## Coverage

- Lines: 100%
- Branches: 100%
- Functions: 100%
