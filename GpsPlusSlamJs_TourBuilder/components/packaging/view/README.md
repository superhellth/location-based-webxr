# packaging/view — browser side effects

The DOM half of component 5. `core/` produces values (a `Blob`, a string of SVG);
these two functions put them in front of the user. Kept separate so the packing
logic stays DOM-free and unit-testable, and so the AR/authoring app (component 10) can reuse `core/` with its own UI.

Both are exercised via the demo (`pnpm dev` → `/components/packaging/`), not unit
tests — there is no logic here worth pinning, only the side effect.

## Modules

- **`download-blob.ts`** — `downloadBlob(blob, filename)`. Object URL → synthetic
  `<a download>` click. The revoke is deferred one tick: revoking synchronously
  after `click()` can cancel the download before the browser has read the URL.
- **`qr-view.ts`** — `renderQrSvg(host, svg)`. `innerHTML` is safe here
  specifically because the markup comes from the local `qrcode` encoder, never
  from an author or the network.
