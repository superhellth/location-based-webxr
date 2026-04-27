/**
 * Sync Manager Tests
 *
 * Tests for the periodic sync manager that syncs OPFS data to an external
 * ZIP file at regular intervals and on page visibility changes.
 *
 * Why these tests matter:
 * - Periodic sync provides crash safety for user data
 * - Visibility change handling ensures sync on app backgrounding
 * - Proper lifecycle management prevents memory leaks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSyncManager, DEFAULT_SYNC_INTERVAL_MS } from './sync-manager';

describe('sync-manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock document for visibility change handling
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * Create a mock file handle for testing.
   * @deprecated Currently unused but kept for future integration tests.
   */
  function _createMockFileHandle(): FileSystemFileHandle {
    return {
      kind: 'file' as const,
      name: 'test-session.zip',
      createWritable: vi.fn(() =>
        Promise.resolve({
          write: vi.fn(() => Promise.resolve()),
          close: vi.fn(() => Promise.resolve()),
        })
      ),
      getFile: vi.fn(),
      isSameEntry: vi.fn(),
      queryPermission: vi.fn(),
      requestPermission: vi.fn(),
    } as unknown as FileSystemFileHandle;
  }

  describe('createSyncManager', () => {
    it('returns a SyncManager object with expected methods', () => {
      // Why: Verify the API surface of the sync manager
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      expect(manager).toHaveProperty('start');
      expect(manager).toHaveProperty('stop');
      expect(manager).toHaveProperty('getStatus');
      expect(manager).toHaveProperty('syncNow');
      expect(typeof manager.start).toBe('function');
      expect(typeof manager.stop).toBe('function');
      expect(typeof manager.getStatus).toBe('function');
      expect(typeof manager.syncNow).toBe('function');
    });

    it('uses default interval of 60 seconds', () => {
      // Why: 60 seconds is the agreed sync interval per user feedback doc
      expect(DEFAULT_SYNC_INTERVAL_MS).toBe(60_000);
    });
  });

  describe('start/stop lifecycle', () => {
    it('starts periodic sync at the configured interval', async () => {
      // Why: Periodic sync is the core feature for crash safety
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();

      // Sync shouldn't be called immediately
      expect(syncFn).not.toHaveBeenCalled();

      // Advance time by 1 second
      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(1);

      // Advance by another second
      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(2);

      manager.stop();
    });

    it('stops periodic sync when stop() is called', async () => {
      // Why: Proper cleanup prevents memory leaks and unwanted syncs
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(1);

      manager.stop();

      // No more syncs after stop
      await vi.advanceTimersByTimeAsync(5000);
      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('does not start multiple intervals if start() called twice', async () => {
      // Why: Prevent duplicate intervals causing excessive syncs
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();
      manager.start(); // Second call should be a no-op

      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(1); // Not 2
    });

    it('can restart after being stopped', async () => {
      // Why: Allow resuming sync after pause
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(1);

      manager.stop();
      manager.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(syncFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStatus', () => {
    it('returns idle status when not started', () => {
      // Why: Status should reflect manager state accurately
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      const status = manager.getStatus();
      expect(status.state).toBe('idle');
      expect(status.lastSyncTime).toBeNull();
      expect(status.lastError).toBeNull();
    });

    it('returns active status when started', () => {
      // Why: Status should reflect manager state accurately
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      manager.start();
      const status = manager.getStatus();
      expect(status.state).toBe('active');
    });

    it('updates lastSyncTime after successful sync', async () => {
      // Why: Track last sync for UI display
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();
      expect(manager.getStatus().lastSyncTime).toBeNull();

      await vi.advanceTimersByTimeAsync(1000);

      const status = manager.getStatus();
      expect(status.lastSyncTime).not.toBeNull();
      expect(status.lastError).toBeNull();
    });

    it('records error on sync failure', async () => {
      // Why: Errors must be surfaced for debugging
      const error = new Error('Sync failed: disk full');
      const syncFn = vi.fn(() => Promise.reject(error));
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();
      await vi.advanceTimersByTimeAsync(1000);

      const status = manager.getStatus();
      expect(status.lastError).toBe('Sync failed: disk full');
    });

    it('clears error after successful sync', async () => {
      // Why: Old errors shouldn't persist after recovery
      let shouldFail = true;
      const syncFn = vi.fn(() => {
        if (shouldFail) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve();
      });
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();

      // First sync fails
      await vi.advanceTimersByTimeAsync(1000);
      expect(manager.getStatus().lastError).toBe('Temporary failure');

      // Second sync succeeds
      shouldFail = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(manager.getStatus().lastError).toBeNull();
    });

    it('shows syncing state during sync operation', async () => {
      // Why: UI needs to show when sync is in progress
      let resolveSync: () => void;
      const syncFn = vi.fn(
        () => new Promise<void>((resolve) => (resolveSync = resolve))
      );
      const statusChanges: string[] = [];
      const manager = createSyncManager(syncFn, {
        intervalMs: 1000,
        onStatusChange: (status) => statusChanges.push(status.state),
      });

      manager.start();

      // Trigger sync
      const syncPromise = manager.syncNow();

      // Status should be 'syncing' while in progress
      expect(manager.getStatus().state).toBe('syncing');
      expect(statusChanges).toContain('syncing');

      // Complete sync
      resolveSync!();
      await syncPromise;

      // Status should be 'active' after completion
      expect(manager.getStatus().state).toBe('active');
      manager.stop();
    });

    it('prevents concurrent sync operations', async () => {
      // Why: Avoid race conditions when timer and visibility change overlap
      let resolveSync: () => void;
      const syncFn = vi.fn(
        () => new Promise<void>((resolve) => (resolveSync = resolve))
      );
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();

      // Start first sync (doesn't complete yet)
      const firstSync = manager.syncNow();
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(manager.getStatus().state).toBe('syncing');

      // Try to start second sync while first is in progress
      const secondSync = manager.syncNow();
      // Should NOT call syncFn again
      expect(syncFn).toHaveBeenCalledTimes(1);

      // Complete first sync
      resolveSync!();
      await firstSync;
      await secondSync;

      expect(manager.getStatus().state).toBe('active');
      manager.stop();
    });
  });

  describe('syncNow', () => {
    it('triggers immediate sync', async () => {
      // Why: Manual sync needed for visibility change handling
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 60_000 });

      manager.start();

      await manager.syncNow();

      expect(syncFn).toHaveBeenCalledTimes(1);
    });

    it('updates status after manual sync', async () => {
      // Why: Manual sync should update status same as periodic
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      manager.start();
      await manager.syncNow();

      expect(manager.getStatus().lastSyncTime).not.toBeNull();
    });

    it('resets interval timer after manual sync', async () => {
      // Why: Avoid syncing twice in quick succession
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn, { intervalMs: 1000 });

      manager.start();

      // Advance 500ms (halfway to next sync)
      await vi.advanceTimersByTimeAsync(500);

      // Manual sync
      await manager.syncNow();
      expect(syncFn).toHaveBeenCalledTimes(1);

      // Advance another 500ms - shouldn't trigger periodic sync yet
      await vi.advanceTimersByTimeAsync(500);
      expect(syncFn).toHaveBeenCalledTimes(1);

      // Advance another 500ms (now 1000ms since manual sync) - should trigger
      await vi.advanceTimersByTimeAsync(500);
      expect(syncFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('visibility change handling', () => {
    it('syncs when page becomes hidden', async () => {
      // Why: Sync before app goes to background (user switching apps)
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      // Mock document.visibilityState
      let visibilityState = 'visible';
      vi.stubGlobal('document', {
        visibilityState,
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'visibilitychange') {
            // Store handler to trigger later
            (globalThis as Record<string, unknown>)._visibilityHandler =
              handler;
          }
        }),
        removeEventListener: vi.fn(),
      });

      try {
        manager.start();

        // Simulate page becoming hidden
        visibilityState = 'hidden';
        vi.stubGlobal('document', {
          ...document,
          visibilityState: 'hidden',
        });
        const handler = (globalThis as unknown as Record<string, () => void>)
          ._visibilityHandler;
        if (handler) {
          handler();
        }

        // Give async sync time to complete
        await vi.advanceTimersByTimeAsync(0);

        expect(syncFn).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
        delete (globalThis as Record<string, unknown>)._visibilityHandler;
      }
    });

    it('removes visibility listener on stop', () => {
      // Why: Cleanup prevents memory leaks
      const syncFn = vi.fn(() => Promise.resolve());
      const manager = createSyncManager(syncFn);

      const removeEventListenerMock = vi.fn();
      vi.stubGlobal('document', {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
      });

      try {
        manager.start();
        manager.stop();

        expect(removeEventListenerMock).toHaveBeenCalledWith(
          'visibilitychange',
          expect.any(Function)
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('status change callback', () => {
    it('calls onStatusChange when sync completes', async () => {
      // Why: UI needs to be notified of status changes
      const syncFn = vi.fn(() => Promise.resolve());
      const onStatusChange = vi.fn();
      const manager = createSyncManager(syncFn, {
        intervalMs: 1000,
        onStatusChange,
      });

      manager.start();
      await vi.advanceTimersByTimeAsync(1000);

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'active',
          lastSyncTime: expect.any(Number) as number,
          lastError: null,
        })
      );
    });

    it('calls onStatusChange when sync fails', async () => {
      // Why: UI needs to show error state
      const syncFn = vi.fn(() => Promise.reject(new Error('Network error')));
      const onStatusChange = vi.fn();
      const manager = createSyncManager(syncFn, {
        intervalMs: 1000,
        onStatusChange,
      });

      manager.start();
      await vi.advanceTimersByTimeAsync(1000);

      expect(onStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          lastError: 'Network error',
        })
      );
    });
  });

  describe('stop() race condition handling', () => {
    it('does not update status after stop() if sync completes late (success path)', async () => {
      // Why: If stop() is called while a sync is in progress, the late-completing
      // sync should NOT overwrite the 'idle' state back to 'active'. This prevents
      // the UI from showing an incorrect "active" state after the manager was stopped.
      let resolveSync: () => void;
      const syncFn = vi.fn(
        () => new Promise<void>((resolve) => (resolveSync = resolve))
      );
      const statusChanges: string[] = [];
      const manager = createSyncManager(syncFn, {
        intervalMs: 1000,
        onStatusChange: (status) => statusChanges.push(status.state),
      });

      manager.start();

      // Trigger sync (doesn't complete yet)
      const syncPromise = manager.syncNow();
      expect(manager.getStatus().state).toBe('syncing');

      // Stop while sync is in flight
      manager.stop();
      expect(manager.getStatus().state).toBe('idle');

      // Now the sync completes
      resolveSync!();
      await syncPromise;

      // Status should still be 'idle', NOT 'active'
      expect(manager.getStatus().state).toBe('idle');
      // The last status change should be 'idle' from stop(), not 'active' from sync completion
      expect(statusChanges[statusChanges.length - 1]).toBe('idle');
    });

    it('does not update status after stop() if sync completes late (error path)', async () => {
      // Why: Same as above, but for the error case. A late-failing sync should
      // not overwrite 'idle' state or set lastError after manager was stopped.
      let rejectSync: (err: Error) => void;
      const syncFn = vi.fn(
        () => new Promise<void>((_, reject) => (rejectSync = reject))
      );
      const statusChanges: string[] = [];
      const manager = createSyncManager(syncFn, {
        intervalMs: 1000,
        onStatusChange: (status) => statusChanges.push(status.state),
      });

      manager.start();

      // Trigger sync (doesn't complete yet)
      const syncPromise = manager.syncNow();
      expect(manager.getStatus().state).toBe('syncing');

      // Stop while sync is in flight
      manager.stop();
      expect(manager.getStatus().state).toBe('idle');
      expect(manager.getStatus().lastError).toBeNull();

      // Now the sync fails
      rejectSync!(new Error('Late failure'));
      await syncPromise;

      // Status should still be 'idle', NOT 'active'
      expect(manager.getStatus().state).toBe('idle');
      // lastError should NOT be set after stop
      expect(manager.getStatus().lastError).toBeNull();
    });
  });
});
