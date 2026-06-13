/**
 * Tests for `decodeFrameTexture` — F3.5b.
 */

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeFrameTexture } from './frame-texture-decoder';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('decodeFrameTexture', () => {
  // Why: a healthy JPEG blob must yield a THREE.Texture whose source
  // image is the decoded ImageBitmap and that has `needsUpdate = true`.
  it('returns a THREE.Texture wrapping the decoded ImageBitmap', async () => {
    const fakeBitmap = {
      width: 4,
      height: 4,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap));

    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    const texture = await decodeFrameTexture(blob);

    expect(texture).not.toBeNull();
    expect(texture).toBeInstanceOf(THREE.Texture);
    expect(texture?.image).toBe(fakeBitmap);
    // `needsUpdate` is a write-only setter on THREE.Texture that bumps
    // `version`; verify the setter fired by checking `version > 0`.
    expect((texture?.version ?? 0) > 0).toBe(true);
  });

  // Why (D2 fix — 2026-06-13 upside-down report): an `ImageBitmap` wrapped in a
  // `THREE.Texture` renders VERTICALLY FLIPPED because three.js cannot apply the
  // WebGL `UNPACK_FLIP_Y_WEBGL` flip to an `ImageBitmap` source on upload. The
  // documented remedy is to flip at decode by asking the browser for a
  // pre-flipped bitmap: `createImageBitmap(blob, { imageOrientation: 'flipY' })`.
  // The geometry path is proven upright (see the D2 elimination test in
  // frame-tile-visualizer.test.ts), so this decode-time flip is the correct and
  // sufficient fix. We assert the OPTION is passed (the only thing observable in
  // headless jsdom — the GPU flip itself cannot be rasterised here).
  it('requests a vertically pre-flipped bitmap (imageOrientation: flipY) to fix the upside-down upload', async () => {
    const fakeBitmap = {
      width: 4,
      height: 4,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    const createImageBitmapSpy = vi.fn().mockResolvedValue(fakeBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);

    const blob = new Blob(['fake'], { type: 'image/jpeg' });
    await decodeFrameTexture(blob);

    expect(createImageBitmapSpy).toHaveBeenCalledWith(
      blob,
      expect.objectContaining({ imageOrientation: 'flipY' })
    );
  });

  // Why: a corrupt blob (createImageBitmap rejects) must surface as
  // `null` so the wirer can drop the frame without unhandled errors.
  it('returns null when createImageBitmap rejects', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('decode failure'))
    );

    const blob = new Blob(['bad'], { type: 'image/jpeg' });
    const texture = await decodeFrameTexture(blob);

    expect(texture).toBeNull();
  });

  // Why: environments lacking `createImageBitmap` (older test runners,
  // unusual SSR contexts) must fail soft rather than throw.
  it('returns null when createImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);

    const blob = new Blob(['x'], { type: 'image/jpeg' });
    const texture = await decodeFrameTexture(blob);

    expect(texture).toBeNull();
  });
});
