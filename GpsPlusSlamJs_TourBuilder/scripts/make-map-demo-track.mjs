// Precomputes the map demo's real-walk GPS track into
// components/map/demo-track.json: one [lat, lng] pair per odometry sample,
// via the framework's already-tested `computeFusedPath` (no new geo math).
//
// Index-aligned with components/proximity/demo-walk.json's `path` array —
// both are derived from the SAME recording's `odometryPositions`, in the
// same order, so `demo-track.json[i]` is the lat/lon of `demo-walk.json.path[i]`
// (world-space) at the same instant. The map demo picks a few shared indices
// to place waypoint anchors that are consistent between the map (lat/lon) and
// the proximity driver (world-space), with zero runtime conversion needed.
//
// Run: node scripts/make-map-demo-track.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { replayRecording } from "gps-plus-slam-app-framework/state";
import { computeFusedPath } from "gps-plus-slam-app-framework/utils/fused-path";

const here = dirname(fileURLToPath(import.meta.url));
const zipPath = resolve(here, "..", "..", "recordings", "2026-06-22_16-06-59utc.zip");
const outPath = join(here, "..", "components", "map", "demo-track.json");

const { readFileSync } = await import("node:fs");
const state = await replayRecording(new Uint8Array(readFileSync(zipPath)));
const gpsData = state.gpsData;

const track = computeFusedPath({
  odometryPositions: gpsData.gpsEvents.odometryPositions,
  alignmentMatrix: gpsData.gpsEvents.alignmentMatrix,
  zeroRef: gpsData.zero,
}).map((p) => [p.lat, p.lng]);

writeFileSync(outPath, JSON.stringify({ track }));
console.log(`Wrote ${track.length} lat/lng points to ${outPath}`);
