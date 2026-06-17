/**
 * QR debug controller — the WS-5 store-driven consumer (live + replay).
 *
 * Subscribes (via `update()` called on every store change) to the recorder's
 * `qrDetected` slice and renders, per marker, the shared debug axis+cube
 * ({@link createQrDebugView}) under `arWorldGroup` at the **derived** best-effort
 * pose+size ({@link selectDerivedQrPlacement}). It owns the as-of depth resolver:
 * every new `recording.latestDepthSample` is fed to it, so the size join is
 * reproducible — the controller runs IDENTICALLY live and on replay because it
 * only reads the store. Replaying a raw recording with a different size/PnP
 * algorithm therefore shows the new placement (the maintainer's re-test goal,
 * visualised).
 *
 * Best-effort: a marker that cannot be sized yet (coarse occupancy depth) renders
 * NOTHING rather than throwing, and a transient miss does NOT clear an existing
 * view (persistence across throttled detections — the view keeps its last pose).
 * Views are torn down only when their marker leaves the store (`clearQrMarker` /
 * `clearAllQrMarkers`).
 *
 * Everything device/PnP-specific is injectable (resolver, solver, view factory,
 * placement selector) so the orchestration is unit-testable without WebXR, three
 * rendering, or PnP numerics (those are covered by the framework tests).
 *
 * @see qr-depth-resolver.ts — the as-of depth join this drives.
 * @see gps-plus-slam-app-framework/ar/qr-debug-view — the rendered axis+cube.
 */

import type { Object3D } from 'three';
// Deep subpaths (NOT the `…/ar` or `…/state` barrels) — the barrels eagerly pull
// heavy transitive deps that break main.ts's partially-mocked wiring tests. Same
// rationale as the demo's qr-debug-view.
import {
  createQrDebugView,
  type QrDebugView,
} from 'gps-plus-slam-app-framework/ar/qr-debug-view';
import { PlanarPnpSquare } from 'gps-plus-slam-app-framework/ar/planar-pnp';
import type {
  DerivedQrPlacement,
  DeriveQrPoseDeps,
} from 'gps-plus-slam-app-framework/ar/qr-derived-pose';
import type { SolvePnpSquare } from 'gps-plus-slam-app-framework/ar/qr-pose';
import {
  selectDerivedQrPlacement,
  type QrDetectedState,
} from 'gps-plus-slam-app-framework/state/qr-detected-slice';
import type { DepthSample } from 'gps-plus-slam-app-framework/types/ar-types';
import {
  createQrDepthResolver,
  type QrDepthResolver,
} from './qr-depth-resolver';

/** The minimal store shape the controller reads (a subset of CombinedRootState). */
export interface QrDebugControllerState {
  qrDetected: QrDetectedState;
  recording: { latestDepthSample: DepthSample | null };
}

export interface QrDebugControllerDeps {
  /** Read the current store state (the controller never subscribes itself). */
  getState: () => QrDebugControllerState;
  /** The `arWorldGroup` to parent debug objects under; `null` until AR starts. */
  getArWorldGroup: () => Object3D | null;
  /** As-of depth resolver (default {@link createQrDepthResolver}). */
  resolver?: QrDepthResolver;
  /** PnP backend (default {@link PlanarPnpSquare}). */
  solver?: SolvePnpSquare;
  /** Debug-view factory (default {@link createQrDebugView}) — overridable in tests. */
  createView?: (parent: Object3D) => QrDebugView;
  /** Placement selector (default {@link selectDerivedQrPlacement}) — overridable in tests. */
  selectPlacement?: (
    state: QrDebugControllerState,
    text: string,
    deps: DeriveQrPoseDeps
  ) => DerivedQrPlacement | null;
  /** Size-measurer tuning forwarded to the derive layer. */
  sizeOptions?: DeriveQrPoseDeps['sizeOptions'];
  /** Reprojection-error gate forwarded to the derive layer. */
  maxReprojectionErrorPx?: number;
}

export interface QrDebugController {
  /** Reconcile the debug objects with the current store state. Call per store change. */
  update(): void;
  /** Tear down all views + the depth resolver (e.g. on session end). */
  dispose(): void;
}

export function createQrDebugController(
  deps: QrDebugControllerDeps
): QrDebugController {
  const resolver = deps.resolver ?? createQrDepthResolver();
  const solver = deps.solver ?? new PlanarPnpSquare();
  const createView = deps.createView ?? createQrDebugView;
  const selectPlacement = deps.selectPlacement ?? selectDerivedQrPlacement;

  const deriveDeps: DeriveQrPoseDeps = {
    resolveDepthAt: (t) => resolver.resolveDepthAt(t),
    solver,
    ...(deps.sizeOptions ? { sizeOptions: deps.sizeOptions } : {}),
    ...(deps.maxReprojectionErrorPx !== undefined
      ? { maxReprojectionErrorPx: deps.maxReprojectionErrorPx }
      : {}),
  };

  const views = new Map<string, QrDebugView>();
  let lastSample: DepthSample | null = null;

  function update(): void {
    const state = deps.getState();

    // 1) Feed the as-of depth history. Both live capture and replay update
    //    `latestDepthSample`; append only on identity change (cheap on every tick).
    const sample = state.recording.latestDepthSample;
    if (sample && sample !== lastSample) {
      lastSample = sample;
      resolver.append(sample);
    }

    // 2) Drop views whose marker left the store (clearQrMarker / clearAllQrMarkers).
    const markers = state.qrDetected.markers;
    for (const text of [...views.keys()]) {
      if (!(text in markers)) {
        views.get(text)!.dispose();
        views.delete(text);
      }
    }

    // 3) Render each marker's best-effort derived placement. Needs arWorldGroup;
    //    until AR starts we still kept depth history above.
    const parent = deps.getArWorldGroup();
    if (!parent) return;
    for (const text of Object.keys(markers)) {
      const placement = selectPlacement(state, text, deriveDeps);
      // Not sizeable yet (or PnP-rejected) → render nothing; a prior view keeps
      // its last pose (persistence) rather than being cleared on a transient miss.
      if (!placement) continue;
      let view = views.get(text);
      if (!view) {
        view = createView(parent);
        views.set(text, view);
      }
      view.update(placement.pose, placement.sizeM);
    }
  }

  return {
    update,
    dispose(): void {
      for (const view of views.values()) view.dispose();
      views.clear();
      resolver.reset();
      lastSample = null;
    },
  };
}
