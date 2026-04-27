/**
 * Unit tests for the Chromium camera-access workaround.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { applyChromiumProjectionLayerWorkaround } from './chromium-camera-access-workaround.js';

interface MutableGlobal {
  XRWebGLBinding?: { prototype: { createProjectionLayer?: () => void } };
  XRRenderState?: { prototype: { layers?: unknown } };
}

const g = globalThis as unknown as MutableGlobal;

afterEach(() => {
  delete g.XRWebGLBinding;
  delete g.XRRenderState;
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
