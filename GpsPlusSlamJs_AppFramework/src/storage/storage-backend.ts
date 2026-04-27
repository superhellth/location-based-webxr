/**
 * StorageBackend Interface
 *
 * Abstraction over action/frame/metadata persistence.
 * Decouples the recorder store from the concrete OPFS implementation,
 * enabling clean testing (NullStorageBackend) and replay mode without vi.mock().
 *
 * See also: Finding F2 in docs/2026-02-15-replay-integration-test-review.md
 */

import type { SessionMetadata } from './opfs-storage';

/**
 * Contract for persisting recording data during a session.
 *
 * Implementations:
 * - OpfsStorageBackend: production — delegates to OPFS via file-system.ts
 * - NullStorageBackend: tests/replay — silent no-ops
 */
export interface StorageBackend {
  /** Persist a Redux action as a numbered JSON file. */
  writeAction(action: unknown, index: number): Promise<void>;
  /** Persist a captured camera frame as a numbered JPEG. */
  writeFrame(blob: Blob, index: number): Promise<void>;
  /** Persist session metadata (session.json). */
  writeSessionMetadata(metadata: SessionMetadata): Promise<void>;
}
