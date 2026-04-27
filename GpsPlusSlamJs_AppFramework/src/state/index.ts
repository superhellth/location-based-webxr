/**
 * State module — Combined store factory, recording coordinator, replay engine, store subscribers.
 */

// --- store ---
export {
  type RecorderState,
  type CombinedRootState,
  type RecorderStore,
  type RecorderStoreOptions,
  type RootState,
  type AppDispatch,
  createRecorderStore,
  startSession,
  endSession,
  recordDepthSample,
  recordWriteFailure,
  setCurrentScenarioName,
  // Re-exports from gps-plus-slam-js
  setZeroPos,
  recordGpsEvent,
  add2dImage,
  markReferencePoint,
  calcRelativeCoordsInMeters,
  // Re-exports from ref-points-slice
  setImportedRefPoints,
  incrementRefPointUsage,
  clearSessionRefPointUsage,
  resetRefPointsState,
  selectCachedKnownRefPoints,
} from './store.js';

export type {
  RecordingOptions,
  /** Store-level session metadata (scenario name, session name, timing). */
  SessionMetadata,
  // Type re-exports from gps-plus-slam-js
  LatLong,
  GpsPoint,
  RawGpsPoint,
  RawDeviceOrientation,
  RecordGpsEventPayload,
  MarkReferencePointPayload,
  // Type re-exports from other modules (also available from their home barrels)
  RefPointMark,
  DepthPoint,
  DepthSample,
  RefPointsState,
  StorageBackend,
  OpfsSessionMetadata,
} from './store.js';

// --- recording-coordinator ---
export {
  type RecordingCoordinatorConfig,
  updateDeviceOrientation,
  getLastDeviceOrientation,
  eulerToQuaternion,
  resetCoordinatorState,
  extractOdomPosition,
  extractOdomRotation,
  buildRawGpsPoint,
  buildRecordGpsEventPayload,
  createGpsPositionHandler,
} from './recording-coordinator.js';

// --- recording-options ---
export {
  type RecordingOptionsInput,
  type DepthCaptureOptions,
  type ImageCaptureOptions,
  STORAGE_KEY,
  DEFAULT_RECORDING_OPTIONS,
  DEPTH_CONSTRAINTS,
  IMAGE_CONSTRAINTS,
  validateDepthOptions,
  validateImageOptions,
  validateRecordingOptions,
  loadRecordingOptions,
  saveRecordingOptions,
  resetRecordingOptions,
  cloneRecordingOptions,
} from './recording-options.js';

// --- recording-replayer ---
export { replayRecording } from './recording-replayer.js';
export type { ReplayRecordingOptions } from './recording-replayer.js';

// --- ref-points-slice ---
export { refPointsReducer } from './ref-points-slice.js';

// --- recorder-slice ---
export { recorderReducer } from './recorder-slice.js';

// --- persistence-middleware ---
export {
  createPersistenceMiddleware,
  type PersistenceMiddlewareOptions,
} from './persistence-middleware.js';

// --- routing-slice ---
export {
  routingReducer,
  navigateTo,
  type RoutingState,
  type AppScreen,
} from './routing-slice.js';

// --- replay-engine ---
export {
  DEFAULT_MAX_DELAY_MS,
  type ReplayState,
  type ProgressCallback,
  type CompleteCallback,
  type ErrorCallback,
  type ReplayAction,
  extractActionTimestamp,
  computeInterActionDelay,
  ReplayEngine,
} from './replay-engine.js';

// --- store-subscribers ---
export {
  type SubscribableStore,
  type StoreSubscriberDeps,
  wireStoreSubscribers,
} from './store-subscribers.js';

// --- subscribe-to-selector ---
export { subscribeToSelector } from './subscribe-to-selector.js';

// --- app-selectors ---
export {
  selectAlignmentMatrix,
  selectGpsPositions,
  selectOdometryPositions,
  selectOdometryRotations,
  selectZeroReference,
  selectReferencePoints,
} from './app-selectors.js';
