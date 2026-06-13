# frame-texture-decoder.ts

F3.5b of the [tracking-quality regression & replay-gaps
feedback](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).

`decodeFrameTexture(blob)` is the production decoder paired with
[`createZipFrameBlobSource`](../storage/zip-frame-blob-source.ts.md)
(replay) or the live in-memory blob cache (F3.5d). It plugs into
the `decodeTexture` slot of
[`wireFrameTileSubscribers`](./wire-frame-tile-subscribers.ts.md).

## Soft-failure contract

The wirer expects `null` for "skip this frame, don't crash". We
return `null` on:

- Missing `createImageBitmap` (older runtimes, exotic SSR).
- Decode rejection — typical for broken frames in the corpus.

Throwing here would route to the wirer's `onError` hook and add
noise; `null` is the right signal for "expected drop".

## Orientation contract (upright)

The returned texture is **upright** — the same way the source JPEG
renders in an `<img>`. `texture.flipY` (three's default `true`) does
**not** apply to an `ImageBitmap` source: three implements the flip via
the WebGL `UNPACK_FLIP_Y_WEBGL` pixel-store flag, which has no effect on
`ImageBitmap` uploads. A naïve `new THREE.Texture(await createImageBitmap(blob))`
therefore renders **vertically flipped** (the 2026-06-13 upside-down
report). We fix it at decode by requesting a pre-flipped bitmap —
`createImageBitmap(blob, { imageOrientation: 'flipY' })` — and setting
`texture.flipY = false` so three does not also try (and only warn). The
geometry/basis path is proven flip-free (D2 elimination test in
`frame-tile-visualizer.test.ts`), so this is the complete fix. See
[frame-tile-rendering-bugs-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-13-frame-tile-rendering-bugs-user-feedback.md)
Finding 2 / D2 and the lessons-learned texture-orientation entry.

## Three.js notes

- `THREE.Texture(bitmap)` is the documented constructor for
  `ImageBitmap` sources.
- `needsUpdate = true` is required so the GPU upload happens on
  the next render.
- Lifecycle disposal is owned by `FrameTileVisualizer.clear()`
  (F3.3); we don't dispose here.

## Tested in `frame-texture-decoder.test.ts`

Four cases: happy path (texture wraps bitmap & `needsUpdate=true`),
the orientation contract (decode passes `imageOrientation: 'flipY'`),
decode rejection → `null`, missing global → `null`.
