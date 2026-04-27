/**
 * Chromium WebXR camera-access tab-crash workaround.
 *
 * Background:
 * Requesting `camera-access` as an optional WebXR feature on recent Android
 * Chrome versions causes a fatal renderer-process crash (`CrRendererMain`)
 * 1–2 seconds after entering AR. The crash reproduces in the upstream
 * three.js `webxr_ar_hittest.html` example with `optionalFeatures:
 * ['camera-access']` added — i.e. it is not specific to this app's session
 * setup. See:
 *
 *   - GpsPlusSlamJs_Docs/docs/2026-04-22-camera-access-reproducer-plan.md
 *   - GpsPlusSlamJs_Docs/docs/2026-04-23-webxr-camera-access-crash-bug-report.html
 *   - https://github.com/mrdoob/three.js/issues/33404
 *
 * Workaround (from the upstream issue thread):
 * Three.js's `WebXRManager` chooses between the newer `XRProjectionLayer`
 * and the older `XRWebGLLayer` based on whether
 * `XRWebGLBinding.prototype.createProjectionLayer` is available. The crash
 * appears to involve the projection-layer + camera-access combination, so
 * removing the prototype method forces three.js to fall back to
 * `XRWebGLLayer`, which sidesteps the bug.
 *
 * `XRRenderState.prototype.layers` is the equivalent capability check used
 * by older three.js (r158-era) and is included for completeness.
 *
 * Caveats:
 * - This is a Chromium-specific hack and the upstream comment explicitly
 *   warns it "might break webxr on other devices" — keep it opt-in.
 * - Must run BEFORE any WebXR session setup. Three.js reads these prototype
 *   members lazily when the first session starts, so calling this at app
 *   bootstrap (before `initAR()`) is sufficient.
 * - Idempotent: safe to call repeatedly. Safe on environments where the
 *   prototypes do not exist (e.g. desktop browsers, jsdom).
 */

interface XRWebGLBindingLike {
  prototype: { createProjectionLayer?: unknown };
}

interface XRRenderStateLike {
  prototype: { layers?: unknown };
}

/**
 * Result of {@link applyChromiumProjectionLayerWorkaround}.
 * Useful for logging and tests.
 */
export interface ChromiumProjectionLayerWorkaroundResult {
  /** True if `XRWebGLBinding.prototype.createProjectionLayer` was deleted on this call. */
  deletedCreateProjectionLayer: boolean;
  /** True if `XRRenderState.prototype.layers` was deleted on this call. */
  deletedRenderStateLayers: boolean;
}

/**
 * Apply the Chromium camera-access tab-crash workaround.
 *
 * Removes `XRWebGLBinding.prototype.createProjectionLayer` (three.js r184)
 * and `XRRenderState.prototype.layers` (three.js r158) so three.js falls
 * back to `XRWebGLLayer`, which avoids the renderer-process crash that
 * happens when both projection layers and `camera-access` are enabled.
 *
 * Call once during bootstrap, before any `requestSession()` call.
 *
 * @returns which prototype members were actually deleted on this call.
 */
export function applyChromiumProjectionLayerWorkaround(): ChromiumProjectionLayerWorkaroundResult {
  const result: ChromiumProjectionLayerWorkaroundResult = {
    deletedCreateProjectionLayer: false,
    deletedRenderStateLayers: false,
  };

  const binding = (
    globalThis as unknown as { XRWebGLBinding?: XRWebGLBindingLike }
  ).XRWebGLBinding;
  if (binding && 'createProjectionLayer' in binding.prototype) {
    delete binding.prototype.createProjectionLayer;
    result.deletedCreateProjectionLayer = true;
  }

  const renderState = (
    globalThis as unknown as { XRRenderState?: XRRenderStateLike }
  ).XRRenderState;
  if (renderState && 'layers' in renderState.prototype) {
    delete renderState.prototype.layers;
    result.deletedRenderStateLayers = true;
  }

  return result;
}
