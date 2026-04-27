/**
 * ZIP Export Module
 *
 * Exports OPFS session data as ZIP files for download.
 * Uses @zip.js/zip.js library for streaming ZIP creation and reading.
 *
 * The ZIP uses "store" mode (no compression) because:
 * 1. Images are already compressed (JPEG)
 * 2. Faster packaging
 * 3. Simpler implementation
 *
 * @zip.js/zip.js was chosen over fflate because:
 * - Supports streaming reads and writes (needed for periodic sync to external file)
 * - Can append to existing ZIP files via prependZip
 * - Actively maintained with good TypeScript support
 * - Built-in Web Worker support for non-blocking compression
 */

import { BlobWriter, ZipWriter, BlobReader } from '@zip.js/zip.js';
import { createLogger } from '../utils/logger';

const log = createLogger('ZipExport');

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a ZIP export operation.
 * Provides the blob and metadata for share + summary display.
 *
 * @see 2026-02-06 User Feedback Issue #2 (Share) and Issue #3 (ZIP Stats)
 */
export interface ZipExportResult {
  /** The ZIP blob ready for download or sharing */
  readonly blob: Blob;
  /** Number of files packaged in the ZIP */
  readonly fileCount: number;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Get the OPFS scenarios directory handle.
 * Re-acquires from navigator.storage to avoid holding stale references.
 */
async function getScenariosHandle(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  const gpsRecorderDir = await opfsRoot.getDirectoryHandle('gps-recorder');
  return gpsRecorderDir.getDirectoryHandle('scenarios');
}

/**
 * Stream all files from a directory recursively into a ZipWriter.
 * Files are read one at a time and immediately added to the ZIP,
 * keeping memory usage proportional to a single file (not the total).
 *
 * @returns Number of files added
 */
async function streamDirectoryToZip(
  dirHandle: FileSystemDirectoryHandle,
  zipWriter: ZipWriter<Blob>,
  basePath: string = ''
): Promise<number> {
  let count = 0;

  for await (const entry of dirHandle.values()) {
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      const fileHandle = await dirHandle.getFileHandle(entry.name);
      const file = await fileHandle.getFile();
      await zipWriter.add(relativePath, new BlobReader(file));
      count++;
    } else if (entry.kind === 'directory') {
      const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
      count += await streamDirectoryToZip(
        subDirHandle,
        zipWriter,
        relativePath
      );
    }
  }

  return count;
}

/**
 * Filter and stream per-session ref point observations into a ZipWriter.
 *
 * Reads each ref point JSON from the scenario-level refPoints/ directory,
 * keeps only observations where `sessionId` matches `sessionName`, and writes
 * the filtered definition into the ZIP under `refPoints/{h3}.json`.
 *
 * Ref points with no observations for the current session are skipped entirely.
 * If the refPoints/ directory doesn't exist yet (new scenario), returns 0.
 *
 * @returns Number of ref point files added
 */
async function streamSessionRefPointsToZip(
  scenarioHandle: FileSystemDirectoryHandle,
  sessionName: string,
  zipWriter: ZipWriter<Blob>
): Promise<number> {
  let count = 0;

  let refPointsHandle: FileSystemDirectoryHandle;
  try {
    refPointsHandle = await scenarioHandle.getDirectoryHandle('refPoints');
  } catch {
    // No refPoints directory yet — nothing to include
    return 0;
  }

  for await (const [name, handle] of refPointsHandle.entries()) {
    if (handle.kind !== 'file' || !name.endsWith('.json')) continue;

    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      const def = JSON.parse(text) as {
        observations?: Array<{ sessionId?: string }>;
      };

      if (!Array.isArray(def.observations)) continue;

      const sessionObs = def.observations.filter(
        (o) => o.sessionId === sessionName
      );
      if (sessionObs.length === 0) continue;

      const filtered = { ...def, observations: sessionObs };
      const blob = new Blob([JSON.stringify(filtered, null, 2)], {
        type: 'application/json',
      });
      await zipWriter.add(`refPoints/${name}`, new BlobReader(blob));
      count++;
    } catch (err) {
      log.warn(`Failed to process ref point ${name}:`, err);
    }
  }

  return count;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Export a session from OPFS as a ZIP blob.
 *
 * The ZIP structure mirrors the OPFS session structure:
 * - session.json (at root)
 * - actions/000001.json, actions/000002.json, ...
 * - frames/frame-000001.jpg, frames/frame-000002.jpg, ...
 * - refPoints/{h3}.json (only observations from this session)
 *
 * Uses "store" mode (compression level 0) for fast packaging.
 *
 * @param scenarioName - Name of the scenario
 * @param sessionName - Name of the session folder
 * @returns ZIP export result with blob and file count
 * @throws Error if scenario or session not found
 */
export async function exportSessionAsZip(
  scenarioName: string,
  sessionName: string
): Promise<ZipExportResult> {
  log.info(`Exporting session: ${scenarioName}/${sessionName}`);

  // Get scenario handle
  const scenariosDir = await getScenariosHandle();
  let scenarioHandle: FileSystemDirectoryHandle;
  try {
    scenarioHandle = await scenariosDir.getDirectoryHandle(scenarioName);
  } catch {
    throw new Error(`Scenario "${scenarioName}" not found in OPFS storage`);
  }

  // Get session handle
  let sessionHandle: FileSystemDirectoryHandle;
  try {
    sessionHandle = await scenarioHandle.getDirectoryHandle(sessionName);
  } catch {
    throw new Error(
      `Session "${sessionName}" not found in scenario "${scenarioName}"`
    );
  }

  // Create ZIP using @zip.js/zip.js with store mode (level 0 = no compression)
  // Files are streamed directly — read one, write one — to avoid OOM on
  // large recordings with many frames.
  const blobWriter = new BlobWriter('application/zip');
  const zipWriter = new ZipWriter(blobWriter, { level: 0 });

  let fileCount = await streamDirectoryToZip(sessionHandle, zipWriter);

  // Include per-session ref point observations from the scenario-level refPoints/ dir.
  // Each ref point file is filtered to only contain observations where sessionId
  // matches the current session. Ref points not observed in this session are skipped.
  // This allows full reconstruction by merging refPoints/ from all session ZIPs.
  fileCount += await streamSessionRefPointsToZip(
    scenarioHandle,
    sessionName,
    zipWriter
  );

  // Close and get the blob
  const blob = await zipWriter.close();
  log.info(`ZIP created: ${blob.size} bytes, ${fileCount} files`);

  return { blob, fileCount };
}

/**
 * Sync current OPFS session data to an external file handle.
 *
 * This is used for periodic sync during recording to save data to the user's
 * chosen location (obtained via showSaveFilePicker). The function:
 * 1. Reads all current session data from OPFS
 * 2. Creates a ZIP in memory
 * 3. Writes the ZIP to the external file handle
 *
 * This provides crash safety combined with OPFS - even if the app crashes,
 * the last synced ZIP contains all data up to that point.
 *
 * @param fileHandle - File handle from showSaveFilePicker
 * @param scenarioName - Name of the scenario
 * @param sessionName - Name of the session folder
 * @returns ZIP export result with blob and file count
 * @throws Error if scenario or session not found
 */
export async function syncToExternalZip(
  fileHandle: FileSystemFileHandle,
  scenarioName: string,
  sessionName: string
): Promise<ZipExportResult> {
  log.info(`Syncing to external ZIP: ${scenarioName}/${sessionName}`);

  // Export session as blob
  const result = await exportSessionAsZip(scenarioName, sessionName);

  // Write to external file handle
  const writable = await fileHandle.createWritable();
  await writable.write(result.blob);
  await writable.close();

  log.info(`Synced ${result.blob.size} bytes to external file`);

  return result;
}

/**
 * Trigger a file download in the browser.
 *
 * Uses showSaveFilePicker if available (for better UX on desktop),
 * falls back to <a download> for broader compatibility.
 *
 * @param blob - The blob to download
 * @param filename - Suggested filename
 */
export async function downloadZip(blob: Blob, filename: string): Promise<void> {
  // Try File System Access API first (better UX on desktop)
  if ('showSaveFilePicker' in window && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'ZIP Archive',
            accept: { 'application/zip': ['.zip'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      log.info(`Saved via File System Access API: ${filename}`);
      return;
    } catch (err) {
      const error = err as Error;
      if (error.name === 'AbortError') {
        // User cancelled - don't fall through
        log.info('User cancelled save dialog');
        return;
      }
      // Fall through to <a download> fallback
      log.warn('showSaveFilePicker failed, using fallback:', error.message);
    }
  }

  // Fallback: <a download> approach
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  log.info(`Download triggered via <a download>: ${filename}`);
}

/**
 * Export and download a session in one step.
 *
 * Convenience function combining exportSessionAsZip and downloadZip.
 *
 * @param scenarioName - Name of the scenario
 * @param sessionName - Name of the session folder
 */
export async function exportAndDownloadSession(
  scenarioName: string,
  sessionName: string
): Promise<void> {
  const { blob } = await exportSessionAsZip(scenarioName, sessionName);
  const filename = `${scenarioName}-${sessionName}.zip`;
  await downloadZip(blob, filename);
}
