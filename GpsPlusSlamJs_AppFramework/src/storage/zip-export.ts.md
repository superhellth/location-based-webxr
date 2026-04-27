# ZIP Export Module

## Purpose

Exports OPFS session data as downloadable ZIP files. Also provides periodic sync to external file handles for crash safety during recording.

## Why ZIP?

1. **Universal format**: Readable by all OS archive utilities
2. **Single file**: Easier to share than folder of files
3. **Store mode**: No compression needed (images already compressed), fast packaging

## Library Choice: @zip.js/zip.js

Migrated from `fflate` to `@zip.js/zip.js` because:

1. **Streaming support**: Needed for periodic sync to external file handles
2. **Actively maintained**: Regular updates, good TypeScript support
3. **Web Worker support**: Built-in for non-blocking compression
4. **Append support**: Can prepend existing ZIPs for incremental updates

## Public API

### Types

```typescript
/** Result of a ZIP export operation (Issue #2+#3, 2026-02-06) */
interface ZipExportResult {
  blob: Blob; // The ZIP blob ready for download or sharing
  fileCount: number; // Number of files packaged in the ZIP
}
```

### Export Session

```typescript
import { exportSessionAsZip } from './zip-export';

// Export a specific session — returns blob + file count
const { blob, fileCount } = await exportSessionAsZip(
  'my-scenario',
  'recording-2026-01-26_10-00-00utc'
);
```

### Download ZIP

```typescript
import { downloadZip } from './zip-export';

// Trigger browser download
await downloadZip(zipBlob, 'my-scenario-2026-01-26.zip');
```

### Combined Export + Download

```typescript
import { exportAndDownloadSession } from './zip-export';

// One-step export and download
await exportAndDownloadSession(
  'my-scenario',
  'recording-2026-01-26_10-00-00utc'
);
```

### Sync to External File Handle

```typescript
import { syncToExternalZip } from './zip-export';

// Sync OPFS data to user's chosen file — returns blob + file count
const handle = await window.showSaveFilePicker({ ... });
const { blob, fileCount } = await syncToExternalZip(handle, 'my-scenario', 'recording-...');
```

This is used by [sync-manager.ts](sync-manager.ts) for periodic crash-safe syncing.

## ZIP Structure

The exported ZIP mirrors the OPFS session structure, plus per-session ref points:

```
{scenario}-{session}.zip
├── session.json          # Session metadata
├── actions/
│   ├── 000001.json       # Redux actions
│   ├── 000002.json
│   └── ...
├── frames/
│   ├── frame-000001.jpg  # Captured images
│   ├── frame-000002.jpg
│   └── ...
└── refPoints/            # Ref points observed in THIS session only
    ├── {h3-cell-a}.json  # Filtered RefPointDefinition (per-session observations)
    └── {h3-cell-b}.json
```

The `refPoints/` folder contains only observations where `sessionId` matches the current session. Ref points not observed in this session are omitted. The full scenario-level ref point state is reconstructed by merging `refPoints/` from all session ZIPs (see `ref-point-importer.ts`).

## Invariants

1. Uses @zip.js/zip.js library with `level: 0` (store mode, no compression)
2. File paths in ZIP match OPFS paths (relative to session root)
3. Binary data (frames) is preserved exactly
4. Download uses `showSaveFilePicker` when available, falls back to `<a download>`
5. `syncToExternalZip` writes to external file handle via `createWritable()`
6. Files are streamed one at a time into the ZipWriter (not accumulated in memory first). This keeps peak memory proportional to a single file, avoiding OOM on large recordings with many frames.
7. Ref points are filtered per-session before inclusion — only observations where `sessionId` matches the exported session appear in the ZIP. If the `refPoints/` directory doesn't exist yet, it is silently skipped.

## Error Modes

| Error                | Cause                      | Recovery                  |
| -------------------- | -------------------------- | ------------------------- |
| "Scenario not found" | Invalid scenario name      | Check scenario exists     |
| "Session not found"  | Invalid session name       | Check session exists      |
| AbortError           | User cancelled save dialog | Normal - no action needed |

## Dependencies

- `@zip.js/zip.js`: ZIP library (actively maintained; supports streaming, Web Worker integration, and incremental updates)

## Tests

- Unit tests: `zip-export.test.ts`
- Uses OPFS mocks to populate session data
- Verifies ZIP structure by unzipping with `@zip.js/zip.js`
