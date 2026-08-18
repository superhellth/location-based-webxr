# packaging/view — browser side effects

The DOM half of component 5. `core/` produces values (a `Blob`, a string of SVG);
`qr-view.ts` puts the SVG in front of the user. The `Blob` download side effect
lives upstream now — `downloadZip` from `gps-plus-slam-app-framework/storage`
(File System Access API with an `<a download>` fallback) — so component 5 no
longer needs its own `download-blob.ts`.

Exercised via the demo (`pnpm dev` → `/components/packaging/`), not unit
tests — there is no logic here worth pinning, only the side effect.

## Modules

- **`qr-view.ts`** — `renderQrSvg(host, svg)`. `innerHTML` is safe here
  specifically because the markup comes from the local `qrcode` encoder, never
  from an author or the network.
