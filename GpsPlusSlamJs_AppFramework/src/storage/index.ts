/**
 * Storage module — OPFS, ZIP export/import, storage abstractions.
 */

// --- storage-backend ---
export { type StorageBackend } from './storage-backend.js';

// --- null-storage-backend ---
export { NullStorageBackend } from './null-storage-backend.js';

// --- opfs-storage-backend ---
export { OpfsStorageBackend } from './opfs-storage-backend.js';

// --- opfs-storage ---
export {
  type SessionMetadata,
  type CreateSessionResult,
  resetOpfsStorage,
  resetSessionHandles,
  initOpfsStorage,
  createSession,
  getSessionHandle,
  getScenarioHandle,
  getScenariosRootHandle,
  listSessions,
  checkStorageQuota,
  writeSessionMetadata,
} from './opfs-storage.js';

// --- file-system ---
export {
  resetStorageState,
  resetForNewSession,
  type WriteAccessResult,
  verifyWriteAccess,
  initStorage,
  startSession as startStorageSession,
  writeAction,
  writeFrame,
  writeSessionMetadata as writeSessionMeta,
  isRefPointAction,
  loadScenarioRefPoints,
  getCurrentScenarioHandle,
  setCurrentScenario,
} from './file-system.js';

// --- file-system-utils ---
export {
  formatTimestamp,
  formatActionFilename,
  formatFrameFilename,
} from './file-system-utils.js';

// --- ref-point-importer ---
export {
  type ImportedRefPoint,
  type RefPointImportResult,
  importRefPointsFromFolder,
} from './ref-point-importer.js';

// --- ref-point-loader ---
export {
  type RefPointObservation,
  type RefPointDefinition,
  loadAllRefPoints,
  loadRefPoint,
  saveRefPointObservation,
  listRefPointIds,
  type RefPointMark,
  flattenRefPointsToMarks,
  averageGpsPerRefPoint,
} from './ref-point-loader.js';

// --- zip-export ---
export {
  type ZipExportResult,
  exportSessionAsZip,
  syncToExternalZip,
  downloadZip,
  exportAndDownloadSession,
} from './zip-export.js';

// --- zip-reader ---
export {
  type Entry,
  MAX_ACTION_FILE_SIZE,
  type RecordedAction,
  type ZipActionEntry,
  readZipEntries,
  loadActionsFromZip,
  loadSessionMetadata as loadSessionMetadataFromZip,
  loadSessionMetadataFromBlob,
  type GpsPathCoord,
  loadGpsPathFromBlob,
} from './zip-reader.js';
