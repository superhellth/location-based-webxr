/**
 * Standalone demo for component 10 (TASK.md §2.3): drop a couple of
 * waypoints with attached assets while the position moves — live from a real
 * device, or replayed from a real Task 1 walk (`demo-track.json`, the RAW
 * recorded GPS fixes, not a fused path — plan AU8) — then export a real
 * `tour.zip` via component 5's already-approved `packTour`.
 *
 * No Three.js, no canvas (plan AU1) — a plain DOM page, same spirit as
 * packaging's demo. `mountAuthoringView` renders the waypoint list, radius
 * inputs, asset file inputs, and its own Drop Waypoint / Export buttons; this
 * file only wires the position source, the store, and what "Export" does.
 */

import { authoringReducer } from "../../store/authoring-slice.js";
import type { AuthoringSliceState } from "../../store/authoring-slice.js";
import { PackagingError } from "../packaging/core/pack-tour.js";
import { packTour } from "../packaging/core/pack-tour.js";
import { downloadBlob } from "../packaging/view/download-blob.js";
import { createPlaybackLoop } from "../shared/playback-loop.js";
import { createAuthoringSession } from "./view/authoring-session.js";
import { createFilesAssetProvider } from "./view/files-asset-provider.js";
import { createLiveGpsPositionSource } from "./view/gps-position-source.js";
import { mountAuthoringView } from "./view/authoring-view.js";
import type { PositionSource } from "./view/gps-position-source.js";
import track from "./demo-track.json";

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const statusEl = el<HTMLParagraphElement>("status");
const exportStatusEl = el<HTMLParagraphElement>("export-status");
const authoringRoot = el<HTMLDivElement>("authoring-root");
const playPauseButton = el<HTMLButtonElement>("play-pause");
const scrubInput = el<HTMLInputElement>("scrub");
const modeInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="mode"]'),
);

// ── A minimal hand-rolled store over the real authoringReducer (same spirit
// as components 1/4's own dispatch loops — no full Redux store needed for a
// standalone demo). ──────────────────────────────────────────────────────
let authoringState: AuthoringSliceState = authoringReducer(undefined, {
  type: "@@INIT",
});
const listeners = new Set<() => void>();
function dispatch(action: Parameters<typeof authoringReducer>[1]): void {
  authoringState = authoringReducer(authoringState, action);
  for (const l of listeners) l();
}
const store = {
  getState: () => ({ authoring: authoringState }),
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  dispatch,
};

// ── Position source: swappable between live GPS and the replayed track. ───
let positionListener:
  | ((pos: { lat: number; lon: number; altitude?: number }) => void)
  | null = null;
const replaySource: PositionSource = {
  subscribe(onPosition) {
    positionListener = onPosition;
    return () => {
      positionListener = null;
    };
  },
};
const liveSource = createLiveGpsPositionSource();

const filesAssetProvider = createFilesAssetProvider();
let session = createAuthoringSession({
  positionSource: replaySource,
  dispatch,
  getState: store.getState,
  filesAssetProvider,
});

function switchMode(mode: "live" | "replay"): void {
  session.destroy();
  session = createAuthoringSession({
    positionSource: mode === "live" ? liveSource : replaySource,
    dispatch,
    getState: store.getState,
    filesAssetProvider,
  });
  statusEl.textContent =
    mode === "live" ? "Waiting for a live GPS fix…" : "Replaying Task 1 walk.";
  view.destroy();
  view = mountAuthoringView(authoringRoot, viewDeps());
}

function viewDeps() {
  return {
    session,
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch,
    onExport: async (
      result: Awaited<ReturnType<typeof session.exportTour>>,
    ) => {
      try {
        const blob = await packTour(result.tour, new Map(result.assetFiles));
        downloadBlob(blob, "tour.zip");
        exportStatusEl.textContent = `Packed tour.zip — ${blob.size.toLocaleString()} bytes, ${result.tour.waypoints.length} waypoint(s).`;
        exportStatusEl.dataset["state"] = "ok";
      } catch (error) {
        exportStatusEl.textContent =
          error instanceof PackagingError && error.message
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        exportStatusEl.dataset["state"] = "error";
      }
    },
  };
}

let view = mountAuthoringView(authoringRoot, viewDeps());

const loop = createPlaybackLoop({
  length: track.track.length,
  samplesPerSec: 5,
  onSeek: (index) => {
    scrubInput.value = String(index);
    const p = track.track[index]!;
    positionListener?.(p);
    statusEl.textContent = `Replaying: sample ${index + 1}/${track.track.length} — ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  },
  onPlayStateChange: (playing) => {
    playPauseButton.textContent = playing ? "Pause" : "Play";
  },
});
scrubInput.max = String(track.track.length - 1);

playPauseButton.addEventListener("click", () => loop.toggle());
scrubInput.addEventListener("input", () =>
  loop.seekTo(Number(scrubInput.value)),
);

for (const input of modeInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    switchMode(input.value as "live" | "replay");
  });
}

statusEl.textContent = "Waiting for a live GPS fix…";
