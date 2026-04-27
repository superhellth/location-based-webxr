# Sync Manager Module

## Purpose

Manages periodic synchronization of OPFS session data to an external ZIP file. Provides crash safety by regularly syncing data to the user's chosen file location (obtained via File System Access API's `showSaveFilePicker`).

## Public API

### `createSyncManager(syncFn, options?): SyncManager`

Factory function to create a sync manager instance.

**Parameters:**

- `syncFn: () => Promise<void>` - The actual sync operation to perform
- `options?: SyncManagerOptions`
  - `intervalMs?: number` - Sync interval (default: 60000ms = 60 seconds)
  - `onStatusChange?: (status: SyncStatus) => void` - Callback for status updates

**Returns:** `SyncManager` instance

### `SyncManager` Interface

```typescript
interface SyncManager {
  start(): void; // Start periodic sync
  stop(): void; // Stop sync and cleanup listeners
  getStatus(): SyncStatus; // Get current sync status
  syncNow(): Promise<void>; // Trigger immediate sync (resets timer)
}
```

### `SyncStatus` Interface

```typescript
interface SyncStatus {
  state: 'idle' | 'active' | 'syncing';
  lastSyncTime: number | null; // ms since epoch
  lastError: string | null;
}
```

### `DEFAULT_SYNC_INTERVAL_MS`

Constant: `60_000` (60 seconds) - The agreed sync interval per user feedback session.

## Invariants & Assumptions

1. **Single interval**: Only one periodic sync interval runs at a time (calling `start()` twice is a no-op)
2. **Visibility sync**: Triggers sync when page becomes hidden (user switching apps)
3. **Timer reset**: Manual `syncNow()` resets the interval timer to avoid double-sync
4. **Error isolation**: Sync failures don't stop the periodic loop; errors are logged and stored in status
5. **Cleanup on stop**: All timers and event listeners are cleaned up when `stop()` is called

## Examples

### Basic usage

```typescript
import { createSyncManager } from './sync-manager';
import { syncToExternalZip } from './zip-export';

const handle = await window.showSaveFilePicker({ ... });

const manager = createSyncManager(
  () => syncToExternalZip(handle, scenarioName, sessionName),
  { intervalMs: 60_000 }
);

manager.start();
// ... recording in progress ...
manager.stop();
```

### With UI status updates

```typescript
const manager = createSyncManager(
  () => syncToExternalZip(handle, scenario, session),
  {
    intervalMs: 60_000,
    onStatusChange: (status) => {
      updateSyncStatus(status); // Update HUD
    },
  }
);
```

## Tests

Covered by [sync-manager.test.ts](sync-manager.test.ts):

- Factory API surface validation
- Start/stop lifecycle (periodic timer management)
- Status tracking (idle, active, lastSyncTime, errors)
- Manual sync via `syncNow()` with timer reset
- Visibility change handling (sync on page hide)
- Status change callbacks

All tests use fake timers for deterministic behavior.
