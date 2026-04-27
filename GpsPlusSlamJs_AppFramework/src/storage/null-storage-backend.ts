/**
 * NullStorageBackend
 *
 * A no-op implementation of StorageBackend for use in tests, replay mode,
 * and any context where persistence is not desired.
 *
 * All methods resolve immediately without side effects.
 */

import type { SessionMetadata } from './opfs-storage';
import type { StorageBackend } from './storage-backend';

export class NullStorageBackend implements StorageBackend {
  async writeAction(_action: unknown, _index: number): Promise<void> {
    // No-op: intentionally empty
  }

  async writeFrame(_blob: Blob, _index: number): Promise<void> {
    // No-op: intentionally empty
  }

  async writeSessionMetadata(_metadata: SessionMetadata): Promise<void> {
    // No-op: intentionally empty
  }
}
