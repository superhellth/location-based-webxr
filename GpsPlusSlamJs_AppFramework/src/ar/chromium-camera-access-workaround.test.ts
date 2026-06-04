/**
 * Unit tests for the Chromium camera-access workaround.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  applyChromiumProjectionLayerWorkaround,
  parseChromeVersion,
  isPatchedChromeForCameraAccess,
  PATCHED_CHROME_MIN,
} from './chromium-camera-access-workaround.js';

interface MutableGlobal {
  XRWebGLBinding?: { prototype: { createProjectionLayer?: () => void } };
  XRRenderState?: { prototype: { layers?: unknown } };
  XRSession?: {
    prototype: { updateRenderState?: (init?: { baseLayer?: unknown }) => unknown };
  };
}

const g = globalThis as unknown as MutableGlobal;

// User agents used to exercise the version-gating logic. The build numbers
// match the documented crash timeline (see the helper's header doc).
const UA_AFFECTED_148 =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.20 Mobile Safari/537.36';
const UA_AFFECTED_147 =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7700.10 Mobile Safari/537.36';
const UA_PATCHED_150 =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.8000.5 Mobile Safari/537.36';
const UA_NON_CHROMIUM =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

afterEach(() => {
  delete g.XRWebGLBinding;
  delete g.XRRenderState;
  delete g.XRSession;
});

describe('applyChromiumProjectionLayerWorkaround', () => {
  it('deletes createProjectionLayer on XRWebGLBinding when present', () => {
    g.XRWebGLBinding = {
      prototype: { createProjectionLayer: () => undefined },
    };

    const result = applyChromiumProjectionLayerWorkaround();

    expect(result.deletedCreateProjectionLayer).toBe(true);
    expect('createProjectionLayer' in g.XRWebGLBinding.prototype).toBe(false);
  });

  it('deletes layers on XRRenderState when present', () => {
    g.XRRenderState = { prototype: { layers: [] } };

    const result = applyChromiumProjectionLayerWorkaround();

    expect(result.deletedRenderStateLayers).toBe(true);
    expect('layers' in g.XRRenderState.prototype).toBe(false);
  });

  it('is a no-op when neither global is present (e.g. desktop, jsdom)', () => {
    const result = applyChromiumProjectionLayerWorkaround();

    expect(result.deletedCreateProjectionLayer).toBe(false);
    expect(result.deletedRenderStateLayers).toBe(false);
  });

  it('is idempotent — second call deletes nothing more', () => {
    g.XRWebGLBinding = {
      prototype: { createProjectionLayer: () => undefined },
    };
    g.XRRenderState = { prototype: { layers: [] } };

    const first = applyChromiumProjectionLayerWorkaround();
    const second = applyChromiumProjectionLayerWorkaround();

    expect(first.deletedCreateProjectionLayer).toBe(true);
    expect(first.deletedRenderStateLayers).toBe(true);
    expect(second.deletedCreateProjectionLayer).toBe(false);
    expect(second.deletedRenderStateLayers).toBe(false);
  });
});

describe('parseChromeVersion', () => {
  // Why this matters: the version gate is only as good as the parser. A
  // mis-parse would either skip on an affected build (crash) or apply on a
  // patched build (re-introduce the crash).
  it('parses a standard Android Chrome user agent', () => {
    expect(parseChromeVersion(UA_AFFECTED_148)).toEqual([148, 0, 7778, 20]);
  });

  it('parses the iOS CriOS variant', () => {
    expect(
      parseChromeVersion('Mozilla/5.0 CriOS/149.0.7821.5 Mobile')
    ).toEqual([149, 0, 7821, 5]);
  });

  it('returns null for non-Chromium user agents', () => {
    expect(parseChromeVersion(UA_NON_CHROMIUM)).toBeNull();
  });

  it('returns null for an empty user agent', () => {
    expect(parseChromeVersion('')).toBeNull();
  });
});

describe('isPatchedChromeForCameraAccess', () => {
  // Why this matters: this predicate decides whether the whole workaround is
  // a no-op. Boundary correctness around PATCHED_CHROME_MIN is critical.
  it('treats Chrome 150 (post-fix) as patched', () => {
    expect(isPatchedChromeForCameraAccess(UA_PATCHED_150)).toBe(true);
  });

  it('treats affected Chrome 148 as not patched', () => {
    expect(isPatchedChromeForCameraAccess(UA_AFFECTED_148)).toBe(false);
  });

  it('treats the exact threshold build as not patched (strictly greater)', () => {
    const exact = `Chrome/${PATCHED_CHROME_MIN.join('.')}`;
    expect(isPatchedChromeForCameraAccess(exact)).toBe(false);
  });

  it('treats one patch above the threshold as patched', () => {
    const [a, b, c, d] = PATCHED_CHROME_MIN;
    expect(
      isPatchedChromeForCameraAccess(`Chrome/${a}.${b}.${c}.${d + 1}`)
    ).toBe(true);
  });

  it('treats non-Chromium user agents as not patched (preserves apply behavior)', () => {
    expect(isPatchedChromeForCameraAccess(UA_NON_CHROMIUM)).toBe(false);
  });
});

describe('applyChromiumProjectionLayerWorkaround — version gating', () => {
  it('skips entirely on patched Chrome and leaves prototypes intact', () => {
    // Why this matters: on patched Chrome the legacy XRWebGLLayer path was
    // never fixed, so forcing it would re-introduce the crash. The helper
    // must be a no-op here.
    g.XRWebGLBinding = {
      prototype: { createProjectionLayer: () => undefined },
    };
    g.XRRenderState = { prototype: { layers: [] } };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_PATCHED_150,
    });

    expect(result.skippedPatchedChrome).toBe(true);
    expect(result.deletedCreateProjectionLayer).toBe(false);
    expect(result.deletedRenderStateLayers).toBe(false);
    expect(result.detectedChromeVersion).toBe('150.0.8000.5');
    // Prototypes are untouched so three.js uses its (now fixed) stock path.
    expect('createProjectionLayer' in g.XRWebGLBinding.prototype).toBe(true);
    expect('layers' in g.XRRenderState.prototype).toBe(true);
  });

  it('applies the deletes on affected Chrome 148', () => {
    g.XRWebGLBinding = {
      prototype: { createProjectionLayer: () => undefined },
    };
    g.XRRenderState = { prototype: { layers: [] } };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_AFFECTED_148,
    });

    expect(result.skippedPatchedChrome).toBe(false);
    expect(result.deletedCreateProjectionLayer).toBe(true);
    expect(result.deletedRenderStateLayers).toBe(true);
    expect(result.detectedChromeVersion).toBe('148.0.7778.20');
  });

  it('applies the deletes on the earlier affected Chrome 147', () => {
    g.XRWebGLBinding = {
      prototype: { createProjectionLayer: () => undefined },
    };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_AFFECTED_147,
    });

    expect(result.skippedPatchedChrome).toBe(false);
    expect(result.deletedCreateProjectionLayer).toBe(true);
  });
});

describe('applyChromiumProjectionLayerWorkaround — baseLayer persistence', () => {
  it('wraps updateRenderState on affected Chrome and persists baseLayer', () => {
    // Why this matters: on the 148.0.7778.12 .. 149.0.7821 window the
    // delete-only trick is insufficient — three.js's follow-up
    // updateRenderState({ depthNear, depthFar }) drops the active baseLayer
    // unless we re-supply it.
    const calls: Array<{ baseLayer?: unknown }> = [];
    g.XRSession = {
      prototype: {
        updateRenderState(init?: { baseLayer?: unknown }) {
          calls.push({ ...init });
          return undefined;
        },
      },
    };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_AFFECTED_148,
    });
    expect(result.patchedUpdateRenderState).toBe(true);

    const update = g.XRSession.prototype.updateRenderState!;
    const baseLayer = { id: 'base' };
    update({ baseLayer });
    // Second call without baseLayer (three.js depth update) must still carry
    // the previously-seen baseLayer through to the original implementation.
    update({});

    expect(calls[0].baseLayer).toBe(baseLayer);
    expect(calls[1].baseLayer).toBe(baseLayer);
  });

  it('does not wrap updateRenderState on patched Chrome', () => {
    g.XRSession = {
      prototype: { updateRenderState: () => undefined },
    };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_PATCHED_150,
    });

    expect(result.patchedUpdateRenderState).toBe(false);
  });

  it('does not wrap updateRenderState on unknown (non-Chromium) environments', () => {
    // Why this matters: passing baseLayer through updateRenderState is known
    // to break projection-layer devices (Quest). Restricting the patch to a
    // detected Chrome build avoids touching those environments.
    g.XRSession = {
      prototype: { updateRenderState: () => undefined },
    };

    const result = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_NON_CHROMIUM,
    });

    expect(result.patchedUpdateRenderState).toBe(false);
  });

  it('is idempotent — does not double-wrap updateRenderState', () => {
    g.XRSession = {
      prototype: { updateRenderState: () => undefined },
    };

    const first = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_AFFECTED_148,
    });
    const second = applyChromiumProjectionLayerWorkaround({
      userAgent: UA_AFFECTED_148,
    });

    expect(first.patchedUpdateRenderState).toBe(true);
    expect(second.patchedUpdateRenderState).toBe(false);
  });
});
