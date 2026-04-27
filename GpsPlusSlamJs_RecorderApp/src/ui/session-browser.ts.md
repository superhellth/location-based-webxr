# session-browser.ts

## Purpose

Pure functions for enumerating scenarios and session recordings from a `FileSystemDirectoryHandle`. Used by the Replay Mode UX to let desktop users browse and select previously recorded sessions for replay. No DOM manipulation — this module is the data layer beneath the session browser UI.

## Public API

### `parseDateFromSessionFilename(filename: string): Date | null`

Parse a UTC date from a session zip filename. Supports both standard and scenario-prefixed formats:

- `"recording-2026-02-19_10-15-00utc.zip"` → `Date(2026-02-19T10:15:00Z)`
- `"Paris-session-2026-01-30_14-30-45utc.zip"` → `Date(2026-01-30T14:30:45Z)`
- `"random.zip"` → `null`

Returns `null` for filenames that don't match the timestamp pattern or produce invalid dates.

### `listScenariosFromFolder(rootHandle: FileSystemDirectoryHandle): Promise<string[]>`

Enumerate top-level directory names from a folder handle. Filters to directory entries only, ignores files. Returns names sorted alphabetically.

- **Input:** `FileSystemDirectoryHandle` from `showDirectoryPicker()`
- **Output:** Sorted array of scenario folder names
- **Error modes:** Propagates errors from the File System Access API

### `listSessionZipsInScenario(scenarioHandle: FileSystemDirectoryHandle): Promise<SessionEntry[]>`

Enumerate `*.zip` files within a scenario directory. Each entry includes:

- `filename` — original zip filename
- `fileHandle` — `FileSystemFileHandle` for reading zip bytes
- `date` — parsed UTC `Date` or `null` if filename doesn't match pattern

Returns entries sorted by filename in reverse order (most recent first).

### `SessionEntry` (type)

```typescript
interface SessionEntry {
  filename: string;
  fileHandle: FileSystemFileHandle;
  date: Date | null;
}
```

### `ScenarioSessionMap` (type)

Alias for `Map<string, SessionEntry[]>`. Maps scenario names to their session entries. Used in replay mode for grouping recordings by scenario.

```typescript
type ScenarioSessionMap = Map<string, SessionEntry[]>;
```

## Invariants & Assumptions

- The root folder follows the expected structure: top-level directories are scenarios, `*.zip` files within them are session recordings.
- Filenames use the pattern `*-YYYY-MM-DD_HH-MM-SSutc.zip` for timestamp extraction. Non-matching filenames are still listed but with `date: null`.
- Reverse-alphabetical filename sort equals reverse-chronological sort for the standard naming pattern (year-first, zero-padded components). Most recent recording appears first.
- `discoverScenariosFromZipMetadata` merges both missing metadata and explicit `"Default Scenario"` into a single `DEFAULT_SCENARIO` group.
- Uses the `FileSystemDirectoryHandle.entries()` async iterator — requires File System Access API support.

## Examples

```typescript
import {
  listScenariosFromFolder,
  listSessionZipsInScenario,
  parseDateFromSessionFilename,
} from './session-browser';

// After user selects a folder via showDirectoryPicker()
const rootHandle = await showDirectoryPicker({ mode: 'read' });

// List scenarios
const scenarios = await listScenariosFromFolder(rootHandle);
// → ['Munich Olympiapark', 'Paris Eiffeltower']

// List sessions within a scenario
const scenarioHandle = await rootHandle.getDirectoryHandle('Paris Eiffeltower');
const sessions = await listSessionZipsInScenario(scenarioHandle);
// → [{ filename: 'recording-2026-01-27_14-30-11utc.zip', fileHandle: ..., date: Date }]

// Read zip bytes for replay
const file = await sessions[0].fileHandle.getFile();
const bytes = new Uint8Array(await file.arrayBuffer());
```

## Tests

- **Unit tests:** `session-browser.test.ts` — 19 tests covering scenario enumeration, session zip enumeration, date parsing, sorting, edge cases (empty folders, non-zip files, invalid dates, non-matching filenames).
- **Property tests:** `session-browser.property.test.ts` — 8 property-based tests validating sort invariants, date roundtrip preservation, zip-only filtering, and null-safety for non-matching filenames across randomly generated inputs.
- **Test utilities used:** `MockFSDirectoryHandle` from `test-utils/browser-mocks.ts`.
