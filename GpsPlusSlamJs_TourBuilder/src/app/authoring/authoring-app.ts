/**
 * Goal-2 composition, Authoring mode (plan
 * `plans/2026-08-14-authoring-composition-plan.md`).
 *
 * Sequences the approved components into the real Authoring flow: onboarding
 * gate (9) → authoring tools (10, live GPS only — the replay-track toggle in
 * `components/authoring/demo.ts` is demo-only scaffolding, not part of
 * `mountAuthoringView`'s real contract) → export. Uses the real
 * `createAuthoringStore()`, not a hand-rolled reducer loop.
 *
 */
import "leaflet/dist/leaflet.css";

import {
  checkCameraPermission,
  checkGeolocationPermission,
  requestCameraPermission,
  requestGeolocationPermission,
} from "gps-plus-slam-app-framework/sensors";
import { buildMapData } from "gps-plus-slam-app-framework/visualization/map-data";

import { createAuthoringStore } from "../../store/authoring-store.js";
import type { TourCoord } from "../../store/types.js";
import { mountOnboardingGate } from "../../components/onboarding/view/onboarding-view.js";
import { createLiveGpsPositionSource } from "../../components/authoring/view/gps-position-source.js";
import { createFilesAssetProvider } from "../../components/authoring/view/files-asset-provider.js";
import { createAuthoringSession } from "../../components/authoring/view/authoring-session.js";
import { mountAuthoringView } from "../../components/authoring/view/authoring-view.js";
import { computeMarkerViewModels } from "../../components/map/core/map-marker-state.js";
import { createTourMap } from "../../components/map/view/tour-map.js";
import { mountPackAndSharePanel } from "./pack-and-share-panel.js";
import {
  disableBeforeUnloadWarning,
  enableBeforeUnloadWarning,
} from "./unload-guard.js";
import { requestWakeLock, type WakeLockHandle } from "./wake-lock.js";
import {
  beginDurableAuthoringSession,
  discardDraft,
  findResumableDraft,
  restoreAuthoringDraft,
} from "./restore-authoring-draft.js";

/** Mounts the composed Authoring-mode flow into `root`. */
export function mountAuthoringApp(root: HTMLElement): { destroy(): void } {
  const gateHost = document.createElement("div");
  root.appendChild(gateHost);

  const gate = mountOnboardingGate(gateHost, {
    checkCameraPermission,
    checkGeolocationPermission,
    requestCameraPermission,
    requestGeolocationPermission,
    createAudioContext: () => new AudioContext(),
    onComplete: () => {
      gate.destroy();
      gateHost.remove();
      void startAuthoringFlow(root);
    },
  });

  return {
    destroy() {
      gate.destroy();
      gateHost.remove();
    },
  };
}

/** AC10: offers to resume an interrupted draft before the tools screen mounts. */
async function startAuthoringFlow(root: HTMLElement): Promise<void> {
  const resumableSessionName = await findResumableDraft();
  if (!resumableSessionName) {
    await mountAuthoringTools(root);
    return;
  }

  const promptHost = document.createElement("div");
  promptHost.style.maxWidth = "480px";
  promptHost.style.margin = "32px auto";
  promptHost.style.display = "grid";
  promptHost.style.gap = "10px";

  const message = document.createElement("p");
  message.textContent =
    "An interrupted authoring session was found. Resume it, or discard and start fresh?";
  const resumeButton = document.createElement("button");
  resumeButton.textContent = "Resume previous draft";
  const discardButton = document.createElement("button");
  discardButton.textContent = "Discard and start fresh";
  promptHost.append(message, resumeButton, discardButton);
  root.appendChild(promptHost);

  resumeButton.addEventListener("click", () => {
    promptHost.remove();
    void mountAuthoringTools(root, resumableSessionName);
  });
  discardButton.addEventListener("click", () => {
    promptHost.remove();
    void discardDraft(resumableSessionName).then(() =>
      mountAuthoringTools(root),
    );
  });
}

async function mountAuthoringTools(
  root: HTMLElement,
  resumeSessionName?: string,
): Promise<void> {
  const toolsHost = document.createElement("div");
  toolsHost.style.maxWidth = "640px";
  toolsHost.style.margin = "24px auto 48px";
  toolsHost.style.padding = "0 16px";
  toolsHost.style.display = "grid";
  toolsHost.style.gap = "16px";
  root.appendChild(toolsHost);

  const store = createAuthoringStore();

  // AC10: continue (or start) durable draft persistence, then rehydrate the
  // store from a resumed session's log using the PLAIN dispatch — actions
  // already on disk must not be re-written under new indices.
  const durable = await beginDurableAuthoringSession(resumeSessionName);
  if (resumeSessionName) {
    await restoreAuthoringDraft(store.dispatch, durable.sessionName);
  }
  const dispatch = durable.wrapDispatch(store.dispatch);

  // AC11: keep the screen awake while the author is actively walking the
  // route — a sleeping screen silently stalls the live GPS position source.
  // Re-requested on visibilitychange, since the OS releases the lock
  // whenever the tab is hidden.
  let wakeLockHandle: WakeLockHandle | null = null;
  let exported = false;
  void requestWakeLock().then((handle) => {
    wakeLockHandle = handle;
  });
  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible" || exported) return;
    void requestWakeLock().then((handle) => {
      wakeLockHandle = handle;
    });
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  // AC12: warn before leaving with an unexported, non-empty draft.
  enableBeforeUnloadWarning(() => {
    if (exported) return false;
    const draft = store.getState().authoring;
    return draft.waypoints.length > 0 || draft.breadcrumb.length > 0;
  });

  // AC13: explicit waiting state until the first live GPS fix arrives —
  // Drop Waypoint has nothing to drop at until then.
  const gpsStatus = document.createElement("p");
  gpsStatus.textContent = "Waiting for a live GPS fix…";
  toolsHost.appendChild(gpsStatus);

  const mapSection = document.createElement("section");
  const mapHost = document.createElement("div");
  mapHost.style.height = "260px";
  mapHost.style.borderRadius = "8px";
  mapHost.style.overflow = "hidden";
  mapSection.appendChild(mapHost);
  toolsHost.appendChild(mapSection);
  const tourMap = createTourMap(mapHost);
  tourMap?.show();

  function refreshMapWaypoints(): void {
    tourMap?.setWaypoints(
      computeMarkerViewModels(store.getState().authoring.waypoints, [], null),
    );
  }
  store.subscribe(refreshMapWaypoints);
  refreshMapWaypoints();

  let hasGpsFix = false;
  function updateMapPosition(pos: TourCoord): void {
    if (!hasGpsFix) {
      hasGpsFix = true;
      gpsStatus.textContent = "";
    }
    tourMap?.setGpsPosition(pos.lat, pos.lon);
    tourMap?.render(
      buildMapData({ userPosition: { lat: pos.lat, lng: pos.lon } }),
    );
  }

  const positionSource = createLiveGpsPositionSource();
  const withMapSync = {
    subscribe(onPosition: (pos: TourCoord) => void) {
      return positionSource.subscribe((pos) => {
        updateMapPosition(pos);
        onPosition(pos);
      });
    },
  };

  const filesAssetProvider = createFilesAssetProvider();
  const session = createAuthoringSession({
    positionSource: withMapSync,
    dispatch,
    getState: store.getState,
    filesAssetProvider,
  });

  const authoringRoot = document.createElement("div");
  toolsHost.appendChild(authoringRoot);

  const view = mountAuthoringView(authoringRoot, {
    session,
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch,
    onExport: (result: ReturnType<typeof session.exportTour>) => {
      exported = true;
      disableBeforeUnloadWarning();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockHandle?.release();
      void durable.discard(); // packed successfully — nothing left to resume
      view.destroy();
      authoringRoot.remove();
      mountPackAndSharePanel(toolsHost, {
        tour: result.tour,
        assetFiles: result.assetFiles,
      });
    },
  });
}
