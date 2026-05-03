/**
 * NullStorageBackend
 *
 * A no-op implementation of StorageBackend for use in tests, replay mode,
 * and any context where persistence is not desired.
 *
 * All methods resolve immediately without side effects.
 */

import type { SessionMetadata } from './opfs-storage';
import type { StorageBackend, CreateSessionResult } from './storage-backend';
import { formatTimestamp } from './file-system-utils';

export class NullStorageBackend implements StorageBackend {
  async createSession(
    timestamp: Date,
    _contextTag?: string
  ): Promise<CreateSessionResult> {
    return { sessionName: `recording-${formatTimestamp(timestamp)}` };
  }

  async listSessions(): Promise<string[]> {
    return [];
  }

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
