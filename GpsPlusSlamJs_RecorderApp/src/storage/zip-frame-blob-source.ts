/**
 * Frame blob source for replay mode — F3.5a of
 * [2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).
 *
 * Wraps a recording-zip `Uint8Array` and returns a lookup function
 * compatible with `wireFrameTileSubscribers`'s `blobSource` slot.
 * On creation it reads the central directory once and indexes every
 * entry by its filename, so each subsequent lookup is O(1) + the
 * cost of decompressing that single entry.
 *
 * Returns `null` for unknown paths so the wirer's defensive branch
 * can skip the frame without throwing.
 */

import {
  BlobWriter,
  type Entry,
  Uint8ArrayReader,
  ZipReader,
} from '@zip.js/zip.js';
import {
  SESSION_IMAGES_DIR,
  LEGACY_SESSION_IMAGES_DIR,
} from 'gps-plus-slam-app-framework/storage/file-system-utils';

export type FrameBlobSource = (imageFile: string) => Promise<Blob | null>;

/**
 * The image dir was renamed `frames/` → `images/` (COLMAP export plan Q5). A
 * given ZIP is internally self-consistent (old ZIPs store `frames/…` in both
 * the entry and the persisted `imageFile`; new ones store `images/…`), so a
 * lookup by the stored path normally resolves directly. This swaps the dir
 * prefix as a safety net for any cross-format mismatch (e.g. a hand-merged or
 * migrated ZIP whose `imageFile` and entries disagree).
 */
function swapImagesDirPrefix(path: string): string | null {
  if (path.startsWith(`${SESSION_IMAGES_DIR}/`)) {
    return `${LEGACY_SESSION_IMAGES_DIR}/${path.slice(SESSION_IMAGES_DIR.length + 1)}`;
  }
  if (path.startsWith(`${LEGACY_SESSION_IMAGES_DIR}/`)) {
    return `${SESSION_IMAGES_DIR}/${path.slice(LEGACY_SESSION_IMAGES_DIR.length + 1)}`;
  }
  return null;
}

/**
 * Build a frame blob source backed by the given recording zip bytes.
 * Reads the zip's central directory once; the returned lookup
 * function holds a reference to the entry index for the lifetime of
 * the replay session.
 */
export async function createZipFrameBlobSource(
  zipData: Uint8Array
): Promise<FrameBlobSource> {
  const reader = new ZipReader(new Uint8ArrayReader(zipData));
  const entries = await reader.getEntries();
  const byPath = new Map<string, Entry>();
  for (const entry of entries) {
    if (entry.directory) continue;
    byPath.set(entry.filename, entry);
  }

  return async (imageFile: string): Promise<Blob | null> => {
    let entry = byPath.get(imageFile);
    if (!entry) {
      // Safety net for a frames/↔images/ prefix mismatch (Q5 rename).
      const swapped = swapImagesDirPrefix(imageFile);
      if (swapped) entry = byPath.get(swapped);
    }
    if (!entry || entry.directory) return null;
    return entry.getData(new BlobWriter('image/jpeg'));
  };
}
