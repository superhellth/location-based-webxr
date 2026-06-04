/**
 * Chromium WebXR camera-access tab-crash workaround.
 *
 * Background:
 * Requesting `camera-access` as an optional WebXR feature on Android Chrome
 * 147+ causes a fatal renderer-process crash (`CrRendererMain`) 1–2 seconds
 * after entering AR. The crash reproduces in the upstream three.js
 * `webxr_ar_hittest.html` example with `optionalFeatures: ['camera-access']`
 * added — i.e. it is not specific to this app's session setup. See:
 *
 *   - GpsPlusSlamJs_Docs/docs/2026-04-22-camera-access-reproducer-plan.md
 *   - GpsPlusSlamJs_Docs/docs/2026-06-04-camera-access-crash-regression-chrome-148.md
 *   - https://github.com/mrdoob/three.js/issues/33404
 *   - https://issues.chromium.org/issues/507508099 (root-cause, marked Fixed)
 *
 * There is NOT a single crash here — the Chromium tracker notes the crash on
 * Chrome 147 is different from the crash on 148+, and the simple workaround
 * below only helped on a subset of versions. The timeline:
 *
 *   - 147 .. 148.0.7778.early : deleting `createProjectionLayer` / `layers`
 *       forces three.js onto `XRWebGLLayer` and sidesteps the crash.
 *   - 148.0.7778.12 .. 149.0.7821 : the delete-only trick stopped working.
 *       An additional patch is needed: persist the `baseLayer` reference
 *       across `XRSession.prototype.updateRenderState` so three.js's later
 *       `depthNear`/`depthFar` update does not drop the active `glBaseLayer`.
 *   - > 149.0.7821 (incl. Chrome 150+) : Chromium fixed the root cause and
 *       separated the camera-image lifecycle from the active layer. The fix
 *       targets the stock projection-layer path, so on patched Chrome the
 *       workaround is *harmful*: forcing `XRWebGLLayer` re-enters the legacy
 *       path that was never fixed. On patched Chrome we MUST do nothing and
 *       let three.js use its normal projection-layer path.
 *
 * Because of that last point this helper is version-aware: it detects the
 * Chrome build from the user agent and **skips entirely on patched Chrome**.
 * On all other (affected or unknown) environments it behaves like the
 * original delete-based workaround, and additionally applies the
 * baseLayer-persistence patch when a genuinely affected Chrome build is
 * detected.
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

type UpdateRenderStateFn = (init?: { baseLayer?: unknown }) => unknown;

interface XRSessionLike {
  prototype: { updateRenderState?: UpdateRenderStateFn };
}

/** Marker set on our patched `updateRenderState` so we never double-wrap it. */
const BASE_LAYER_PATCH_MARKER = '__gpsBaseLayerPersistencePatch';

/**
 * Parsed Chrome version as `[major, minor, build, patch]`.
 */
export type ChromeVersion = [number, number, number, number];

/**
 * First Chrome version that contains the Chromium-side fix and therefore must
 * NOT receive the workaround. The crash is fixed after `149.0.7819.0` and the
 * camera image is correctly populated after `149.0.7821.0`; we use the later,
 * stricter threshold so that "skip" only happens when the feature is fully
 * working.
 *
 * @see https://github.com/mrdoob/three.js/issues/33404 (alcooper91)
 */
export const PATCHED_CHROME_MIN: ChromeVersion = [149, 0, 7821, 0];

/**
 * Result of {@link applyChromiumProjectionLayerWorkaround}.
 * Useful for logging and tests.
 */
export interface ChromiumProjectionLayerWorkaroundResult {
  /** True if `XRWebGLBinding.prototype.createProjectionLayer` was deleted on this call. */
  deletedCreateProjectionLayer: boolean;
  /** True if `XRRenderState.prototype.layers` was deleted on this call. */
  deletedRenderStateLayers: boolean;
  /** True if `XRSession.prototype.updateRenderState` was wrapped on this call. */
  patchedUpdateRenderState: boolean;
  /**
   * True if the workaround was skipped because the detected Chrome build
   * already contains the Chromium-side fix (forcing the legacy path would be
   * harmful). When true, all other booleans are false.
   */
  skippedPatchedChrome: boolean;
  /** The detected Chrome version (`"major.minor.build.patch"`), or null. */
  detectedChromeVersion: string | null;
}

/**
 * Parse a Chrome/Chromium version from a user-agent string.
 *
 * Matches the `Chrome/<major>.<minor>.<build>.<patch>` token (and the iOS
 * `CriOS/...` variant). Returns null for non-Chromium user agents.
 */
export function parseChromeVersion(userAgent: string): ChromeVersion | null {
  const match = /(?:Chrome|CriOS)\/(\d+)\.(\d+)\.(\d+)\.(\d+)/.exec(userAgent);
  if (!match) {
    return null;
  }
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ];
}

/** Lexicographically compare two version tuples: returns true if `a` > `b`. */
function isVersionAfter(a: ChromeVersion, b: ChromeVersion): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
}

/**
 * True when the detected Chrome build already contains the Chromium-side fix
 * (> {@link PATCHED_CHROME_MIN}) and therefore must NOT receive the
 * workaround. Non-Chromium user agents return false (treated as potentially
 * affected, preserving the original always-apply behavior).
 */
export function isPatchedChromeForCameraAccess(userAgent: string): boolean {
  const version = parseChromeVersion(userAgent);
  return version !== null && isVersionAfter(version, PATCHED_CHROME_MIN);
}

function getUserAgent(): string {
  const nav = (globalThis as unknown as { navigator?: { userAgent?: string } })
    .navigator;
  return nav?.userAgent ?? '';
}

/**
 * Wrap `XRSession.prototype.updateRenderState` so the `baseLayer` reference is
 * persisted across calls. Three.js calls `updateRenderState({ depthNear,
 * depthFar })` after the base layer was set; on affected Chrome builds that
 * second call drops the active `glBaseLayer`, which leads to the crash on
 * camera-texture access. Re-supplying the last-seen `baseLayer` keeps it
 * alive.
 *
 * Idempotent: a marker on the wrapper prevents double-wrapping.
 *
 * @returns true if the prototype was wrapped on this call.
 */
function patchUpdateRenderStateForBaseLayerPersistence(): boolean {
  const session = (globalThis as unknown as { XRSession?: XRSessionLike })
    .XRSession;
  const original = session?.prototype.updateRenderState;
  if (typeof original !== 'function') {
    return false;
  }
  if (
    (original as unknown as Record<string, unknown>)[BASE_LAYER_PATCH_MARKER]
  ) {
    return false; // already patched
  }

  let lastBaseLayer: unknown;
  const patched: UpdateRenderStateFn = function (
    this: unknown,
    init: { baseLayer?: unknown } = {}
  ) {
    if (init.baseLayer !== undefined) {
      lastBaseLayer = init.baseLayer;
    }
    return (original as UpdateRenderStateFn).call(this, {
      baseLayer: lastBaseLayer,
      ...init,
    });
  };
  (patched as unknown as Record<string, unknown>)[BASE_LAYER_PATCH_MARKER] =
    true;
  session.prototype.updateRenderState = patched;
  return true;
}

/**
 * Apply the Chromium camera-access tab-crash workaround.
 *
 * On Chrome builds that already contain the Chromium-side fix
 * (> {@link PATCHED_CHROME_MIN}, including Chrome 150+) this is a **no-op** —
 * forcing the legacy `XRWebGLLayer` path on patched Chrome re-introduces the
 * very crash the platform fixed. On affected (or unknown) environments it:
 *
 *  - removes `XRWebGLBinding.prototype.createProjectionLayer` (three.js r184)
 *    and `XRRenderState.prototype.layers` (three.js r158) so three.js falls
 *    back to `XRWebGLLayer`; and
 *  - when a genuinely affected Chrome build is detected, also persists the
 *    `baseLayer` across `XRSession.prototype.updateRenderState`.
 *
 * Call once during bootstrap, before any `requestSession()` call.
 *
 * @param options.userAgent override the detected user agent (for testing).
 * @returns which prototype members were actually changed on this call.
 */
export function applyChromiumProjectionLayerWorkaround(options?: {
  userAgent?: string;
}): ChromiumProjectionLayerWorkaroundResult {
  const userAgent = options?.userAgent ?? getUserAgent();
  const version = parseChromeVersion(userAgent);

  const result: ChromiumProjectionLayerWorkaroundResult = {
    deletedCreateProjectionLayer: false,
    deletedRenderStateLayers: false,
    patchedUpdateRenderState: false,
    skippedPatchedChrome: false,
    detectedChromeVersion: version ? version.join('.') : null,
  };

  // Patched Chrome (and anything newer): do nothing. The stock three.js
  // projection-layer path is the one Chromium fixed; forcing the fallback
  // here would re-break camera access.
  if (version && isVersionAfter(version, PATCHED_CHROME_MIN)) {
    result.skippedPatchedChrome = true;
    return result;
  }

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

  // The baseLayer-persistence patch only matters on genuinely affected Chrome
  // builds (the 148.0.7778.12 .. 149.0.7821 window). Restricting it to a
  // detected, non-patched Chrome version avoids touching `updateRenderState`
  // on unknown environments (desktop/Quest/iOS), keeping the original
  // delete-only behavior there.
  if (version) {
    result.patchedUpdateRenderState =
      patchUpdateRenderStateForBaseLayerPersistence();
  }

  return result;
}
