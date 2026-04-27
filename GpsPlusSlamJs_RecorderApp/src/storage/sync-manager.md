# Sync Manager

## Purpose

Manages periodic synchronization of OPFS session data to an external ZIP file.
Provides crash safety by regularly syncing data to the user's chosen file location.

## Public API

### `createSyncManager(syncFn, options): SyncManager`

Factory function that creates a sync manager instance.

- **syncFn**: `() => Promise<void>` — The function to call for each sync operation
- **options**: `SyncManagerOptions` (optional)
  - `intervalMs`: Sync interval in ms (default: 60000)
  - `onStatusChange`: Callback for status updates

Returns a `SyncManager` with:

- `start()`: Begin periodic sync
- `stop()`: Stop sync and cleanup listeners
- `getStatus()`: Get current `SyncStatus`
- `syncNow()`: Trigger immediate sync (resets interval)

### `SyncStatus`

```ts
interface SyncStatus {
  state: 'idle' | 'active' | 'syncing';
  lastSyncTime: number | null;
  lastError: string | null;
}
```

## Invariants & Assumptions

1. **Single instance per session**: Only one sync manager should be active per recording session.
2. **No concurrent syncs**: If a sync is in progress, subsequent sync requests are skipped.
3. **Late completion safety**: If `stop()` is called while a sync is in flight, the completing sync will NOT update status. This prevents the UI from incorrectly showing "active" after the manager was stopped.
4. **Visibility change handling**: Syncs when page goes to background (via `visibilitychange` event).
5. **Interval reset**: Manual syncs and visibility-triggered syncs reset the interval timer to prevent double-syncing.

## Examples

```ts
import { createSyncManager } from './sync-manager';

// Create manager
const manager = createSyncManager(
  () => syncToExternalZip(handle, scenarioName, sessionName),
  {
    intervalMs: 60_000,
    onStatusChange: (status) => updateUI(status),
  }
);

// Start periodic sync
manager.start();

// ... recording in progress ...

// Manual sync if needed
await manager.syncNow();

// Stop when done
manager.stop();
```

## Tests

- Unit tests: [sync-manager.test.ts](sync-manager.test.ts)
- Covers: lifecycle (start/stop), status tracking, concurrent sync prevention, visibility handling, late completion race condition

## Implementation Notes

The `stopped` flag was added to handle the race condition where `syncFn` completes after `stop()` was called. The flag is:

- Set to `false` in `start()`
- Set to `true` at the beginning of `stop()`
- Checked after `await syncFn()` to skip status updates if manager was stopped during the async operation
