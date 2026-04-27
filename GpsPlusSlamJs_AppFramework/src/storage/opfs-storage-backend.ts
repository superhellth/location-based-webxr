/**
 * OpfsStorageBackend
 *
 * Production implementation of StorageBackend that delegates to the
 * existing file-system.ts facade (which in turn uses OPFS).
 *
 * This is the default backend used by createRecorderStore() in production.
 */

import type { SessionMetadata } from './opfs-storage';
import type { StorageBackend } from './storage-backend';
import {
  writeAction as fsWriteAction,
  writeFrame as fsWriteFrame,
  writeSessionMetadata as fsWriteSessionMetadata,
} from './file-system';

export class OpfsStorageBackend implements StorageBackend {
  async writeAction(action: unknown, index: number): Promise<void> {
    await fsWriteAction(action, index);
  }

  async writeFrame(blob: Blob, index: number): Promise<void> {
    await fsWriteFrame(blob, index);
  }

  async writeSessionMetadata(metadata: SessionMetadata): Promise<void> {
    await fsWriteSessionMetadata(metadata);
  }
}
