/**
 * Frame texture decoder — F3.5b of
 * [2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).
 *
 * Decodes a JPEG blob into a `THREE.Texture` via `createImageBitmap`.
 * Compatible with the `decodeTexture` slot of
 * [`wireFrameTileSubscribers`](./wire-frame-tile-subscribers.ts).
 *
 * **Orientation contract (2026-06-13 fix,
 * [frame-tile-rendering-bugs-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-13-frame-tile-rendering-bugs-user-feedback.md)
 * Finding 2 / D2):** the returned texture is **upright** — the same way the
 * source JPEG looks in an `<img>`. three.js cannot apply its default
 * `texture.flipY` to an `ImageBitmap` source (the WebGL `UNPACK_FLIP_Y_WEBGL`
 * flip does not affect `ImageBitmap` uploads), so wrapping a default
 * `createImageBitmap(blob)` in a `THREE.Texture` renders **vertically flipped**.
 * We therefore ask the browser for a pre-flipped bitmap via
 * `{ imageOrientation: 'flipY' }` and set `texture.flipY = false` so three.js
 * does not also try (and only warn) — the bitmap is already correctly oriented.
 * The geometry/basis path is proven flip-free (see the D2 elimination test in
 * `frame-tile-visualizer.test.ts`), so this decode-time flip is the complete fix.
 *
 * Returns `null` (never throws) when:
 *   - `createImageBitmap` is unavailable in the runtime
 *   - the blob cannot be decoded as an image
 *
 * Soft-failure semantics let the wirer drop broken frames in the
 * field-recording corpus without surfacing errors to the user.
 */

import * as THREE from 'three';

export async function decodeFrameTexture(
  blob: Blob
): Promise<THREE.Texture | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    // Pre-flip at decode: an ImageBitmap ignores THREE.Texture.flipY on upload,
    // so the browser must hand us an already-upright bitmap.
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
    const texture = new THREE.Texture(bitmap);
    // The bitmap is already upright; disable three's (ineffective for
    // ImageBitmap, warning-emitting) flip so intent is explicit.
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}
