# mime-for-asset.ts

## Purpose

MIME type for an asset's Blob, derived from its filename. A zip stores raw
bytes with no content type, but the Blob URL handed to a consumer should
carry the right MIME — some engines refuse e.g. audio whose type lies. The
type cannot be hard-coded per asset kind alone (both MP3/OGG and JPG/PNG are
valid for their kinds), so it comes from the file extension first, with a
per-kind default for unrecognized extensions.

## Public API

- **`AssetType`** — `'sprite' | 'model' | 'audio'` (image / GLTF-GLB / MP3-OGG).
- **`mimeForAsset(filename: string, type: AssetType): string`** — MIME from
  the filename's extension; falls back to the type's default when the
  extension is missing or unrecognized.

## Invariants & assumptions

- Pure. No dependencies.
- Extension match is case-insensitive.
- Always returns a string — there is a default for every `AssetType`, so an
  unrecognized/absent extension never produces `undefined`.

## Examples

```ts
import { mimeForAsset } from 'gps-plus-slam-app-framework/storage';

mimeForAsset('assets/story.ogg', 'audio'); // 'audio/ogg'
mimeForAsset('assets/knight.bin', 'model'); // 'model/gltf-binary' (default)
```

## Tests

- `mime-for-asset.test.ts` — extension-derived MIME, case-insensitivity,
  fallback to the type default for an unknown or missing extension.
