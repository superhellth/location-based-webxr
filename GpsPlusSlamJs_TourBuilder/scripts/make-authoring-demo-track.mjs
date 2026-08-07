// Precomputes the authoring demo's "replay a walk" track into
// components/authoring/demo-track.json: the RAW recorded GPS fixes
// (`.latitude`/`.longitude`, inherited from `RawGpsPoint`) from the Task 1
// recording — exactly what `startGpsWatch` would have delivered live during
// that walk, which is what component 10 actually consumes (plan AU2/AU8).
// Unlike components 4/7/8's demo tracks, this is NOT the fused/odometry path.
//
// Run: node scripts/make-authoring-demo-track.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { replayRecording, selectGpsPositions } from "gps-plus-slam-app-framework/state";

const here = dirname(fileURLToPath(import.meta.url));
const zipPath = resolve(here, "..", "..", "recordings", "2026-06-22_16-06-59utc.zip");
const outPath = join(here, "..", "components", "authoring", "demo-track.json");

const state = await replayRecording(new Uint8Array(readFileSync(zipPath)));
const track = selectGpsPositions(state).map((p) =>
  p.altitude === undefined
    ? { lat: p.latitude, lon: p.longitude }
    : { lat: p.latitude, lon: p.longitude, altitude: p.altitude },
);

writeFileSync(outPath, JSON.stringify({ track }));
console.log(`Wrote ${track.length} raw GPS points to ${outPath}`);
