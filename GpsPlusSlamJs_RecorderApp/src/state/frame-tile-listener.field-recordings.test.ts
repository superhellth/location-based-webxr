/**
 * Field-recording replay test for the F3 frame-tile pipeline.
 *
 * Replays a real outdoor recording
 * (`TestDataJs/2026-05-19_15-43-55utc.zip`) through `createRecorderStore()`
 * and asserts that every `gpsData/add2dImage` action persisted in the
 * recording produces exactly one entry in `framesInScene.frames` — i.e.
 * the F3.2 listener middleware closes the gap that previously left replay
 * sessions without textured 2D-frame planes in the scene.
 *
 * See F3 of
 * [2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).
 *
 * Why this test matters: the dedicated unit tests
 * (`add-2d-image-listener.test.ts`, `frames-in-scene-slice.test.ts`,
 * `wire-frame-tile-subscribers.test.ts`) verify each unit in isolation
 * against synthetic actions. This integration test verifies the chain
 * against the exact action stream shape that ships in production
 * recordings — guarding against schema drift (e.g. payload field rename),
 * coupling regressions with upstream `gpsData/recordGpsEvent` ordering,
 * and silent listener-middleware misconfiguration in `createRecorderStore`.
 *
 * Mirrors `ref-point-mark-listener.field-recordings.test.ts` (F2).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadActionsFromZip,
  type ZipActionEntry,
} from 'gps-plus-slam-app-framework/storage/zip-reader';
import { NullStorageBackend } from 'gps-plus-slam-app-framework/storage/null-storage-backend';
import { createRecorderStore } from './recorder-store';
import type { FrameInScene } from './frames-in-scene-slice';

// ---------------------------------------------------------------------------
// Fixture resolution — same scheme as
// ref-point-mark-listener.field-recordings.test.ts (F2).
// Layout: <gpsRoot>/location-based-webxr/GpsPlusSlamJs_RecorderApp/src/state/
//         <gpsRoot>/gps-plus-slam/TestDataJs/...
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const GPS_ROOT = resolve(__dirname, '../../../..');
const FIXTURE = resolve(
  GPS_ROOT,
  'gps-plus-slam/TestDataJs/2026-05-19_15-43-55utc.zip'
);
const fixtureAvailable = existsSync(FIXTURE);

describe.runIf(fixtureAvailable)(
  'frame-tile-listener — outdoor field recording (F3)',
  () => {
    let imageActions: ZipActionEntry[];
    let frames: readonly FrameInScene[];

    beforeAll(async () => {
      const bytes = new Uint8Array(readFileSync(FIXTURE));
      const actionEntries = await loadActionsFromZip(bytes);
      imageActions = actionEntries.filter(
        (e) => e.action.type === 'gpsData/add2dImage'
      );
      const store = createRecorderStore({
        storageBackend: new NullStorageBackend(),
      });
      for (const entry of actionEntries) {
        store.dispatch(entry.action);
      }
      frames = store.getState().framesInScene.frames;
    }, 120_000);

    it('recording contains at least one add2dImage action', () => {
      // Why: if the recording stops persisting add2dImage actions, every
      // downstream assertion is vacuously true — pin the precondition.
      expect(imageActions.length).toBeGreaterThan(0);
    });

    it('replay produces one framesInScene entry per add2dImage action', () => {
      // Why: this is the F3 contract — the listener must mirror every
      // accepted add2dImage into framesInScene so the visualizer can
      // re-create the textured tile in replay.
      expect(frames).toHaveLength(imageActions.length);
    });

    it('every dispatched frame carries the imageFile + pose from its action payload', () => {
      // Why: the listener must preserve the imageFile path (used as the
      // blob-source lookup key in replay) and the raw odom pose (used by
      // the visualizer to place the tile in the world). Losing either
      // breaks the replay visualization.
      for (const frame of frames) {
        expect(typeof frame.imageFile).toBe('string');
        expect(frame.imageFile.length).toBeGreaterThan(0);
        expect(Array.isArray(frame.position)).toBe(true);
        expect(frame.position).toHaveLength(3);
        expect(Array.isArray(frame.rotation)).toBe(true);
        expect(frame.rotation).toHaveLength(4);
      }
    });
  }
);
