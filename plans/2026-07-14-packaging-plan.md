# 2026-07-14 — Component 5: Tour Packaging & QR Code (implementation plan)

## Context

Component 5 is the **authoring-side export step**: take a `Tour` (from
`selectExportedTour`) plus the author's asset `File` objects, bundle them into a
single `tour.zip` stored **uncompressed** (ZIP "store" mode, no DEFLATE), and
provide utilities to build the viewing-mode URL and render a QR code for it.

The uncompressed constraint is deliberate: component 6 range-reads individual
assets as cheap byte-slices without a decompression step. DEFLATE would save almost
nothing because tour assets are already-compressed formats (GLB, MP3/OGG, JPG/PNG).

The contract is **already agreed** in `plans/Shared-Contract.md`. This plan
implements it. The design below was resolved in a grilling on 2026-07-14 and
revised after a plan review the same day.

Package: **`GpsPlusSlamJs_TourBuilder/`**. All logic + demo live under
`components/packaging/`, split `core/` + `view/` + `demo.ts` like components 1–4.

---

## Decisions (resolved in the 2026-07-14 grilling)

| # | Branch | Decision |
|---|--------|----------|
| 1 | ZIP library | **`fflate`** — tiny, tree-shakeable, clean `level: 0` per-entry API for store mode. |
| 2 | QR library | **`qrcode`** — minimal, outputs SVG. Ships no types → needs `@types/qrcode`. |
| 3 | Code location | `components/packaging/` with `core/` + `view/` subdirs — mirrors components 1–4 layout. |
| 4 | `packTour` signature | `packTour(tour: Tour, assetFiles: Map<AssetId, File>): Promise<Blob>` — keyed map prevents silent filename mismatches. |
| 5 | Validation inside `packTour` | **Tour-schema validation: no** — precondition, caller has a valid `Tour`. **ZIP-layout validation: yes** — see decision 12. |
| 6 | ZIP layout | `AssetEntry.filename` used **verbatim** as the ZIP entry path. Component 6 looks up entries by `entry.filename` with no translation. |
| 7 | QR generation | **Separate function** `generateQr(tourUrl: string): Promise<string>` returns an SVG string. `packTour` produces the ZIP only. |
| 8 | Demo | Pre-loads sample fixture + file inputs to override with real assets. Inputs for app base URL + hosted ZIP URL feed `buildTourUrl` → `generateQr`. |
| 9a | ZIP store-mode test | Inspect raw bytes — assert compression method `0x0000` in **both** the local header and the central directory, plus `compressedSize === uncompressedSize`, for every entry. |
| 9b | QR test | **`vi.mock("qrcode")`** — assert `toString` called with the correct URL + options. |
| 10 | Missing asset error | **Throw immediately** with message listing missing ids. Never produce a partial ZIP. |
| 11 | Filename convention | **`assetFilename(id, file): string`** pure helper → `assets/<id>.<ext>`. Used by the authoring UI (and the demo) when building `AssetEntry`; documented as the convention `packTour` relies on. |
| 12 | ZIP entry-path safety (**new**) | `packTour` rejects duplicate `filename`s and unsafe paths. Contract §Invariant 3 assigns "every `AssetEntry.filename` is present in the zip" to component 5 — a silent overwrite would violate it. |
| 13 | URL construction (**new**) | Pure helper **`buildTourUrl(appBaseUrl, zipUrl): string`**. The zip URL contains `://`, `?` and `&`, so it must be percent-encoded into the `?tour=` param. `generateQr` takes the finished URL and does no URL work. |
| 14 | fflate API (**new**) | Async **`fflate.zip`** (callback, promisified), not `zipSync`. Same code size, no main-thread freeze on a 40 MB GLB. Streaming `Zip` + `ZipPassThrough` is the escape hatch if peak memory (~2× total bytes) becomes a problem — the swap is hidden behind `packTour`. |

---

## Public API

```ts
// components/packaging/core/pack-tour.ts
import type { Tour, AssetId } from "../../../store/types.js";

/**
 * Bundle a tour into an uncompressed ZIP Blob.
 *
 * @precondition `tour` has passed `validateTour` (or was produced by
 * `selectExportedTour` from the authoring slice).
 * @throws {PackagingError} if any AssetId in `tour.assets` has no corresponding
 * File in `assetFiles`, or if the asset filenames are not a safe, unique set.
 */
export function packTour(
  tour: Tour,
  assetFiles: Map<AssetId, File>,
): Promise<Blob>;

export class PackagingError extends Error {}

// components/packaging/core/asset-filename.ts
/**
 * Canonical filename for an asset inside tour.zip.
 * Used by the authoring UI (when building AssetEntry) and relied on by packTour.
 * Convention: assets/<id>.<lowercased-original-extension>
 */
export function assetFilename(id: AssetId, file: File): string;

// components/packaging/core/build-tour-url.ts
/**
 * Viewing-mode URL for a hosted tour.zip: `<appBaseUrl>?tour=<encoded zipUrl>`.
 * `zipUrl` is percent-encoded — it typically contains `://`, `?` and `&`
 * (e.g. a presigned URL), which would otherwise truncate the param.
 */
export function buildTourUrl(appBaseUrl: string, zipUrl: string): string;

// components/packaging/core/generate-qr.ts
/**
 * Generate an SVG QR code whose data is `tourUrl`.
 * The caller passes the finished URL — use `buildTourUrl` to make one.
 */
export function generateQr(tourUrl: string): Promise<string>;
```

---

## File layout

```
components/packaging/
  core/
    asset-filename.ts        asset-filename.test.ts
    build-tour-url.ts        build-tour-url.test.ts
    pack-tour.ts             pack-tour.test.ts
    generate-qr.ts           generate-qr.test.ts
    README.md                # Purpose / Public API / Invariants / Examples / Tests
  view/
    download-blob.ts         # triggers the browser download of tour.zip
    qr-view.ts               # renders an SVG string into a container element
    README.md
  demo.ts                    # demo control panel
  index.html                 # demo page
  README.md                  # component overview
```

Conventions this follows (checked against the existing package, not assumed):

- **Per-directory `README.md`**, not per-file `*.ts.md` sidecars. TourBuilder
  documents `components/billboard/core/README.md`, `store/README.md`, etc.
  (Per-file sidecars are the *framework* package's convention.)
- **One `*.test.ts` per source file**, colocated in `core/` (mirrors
  `panel-layout.ts` / `panel-layout.test.ts`).
- **`core/` is pure/DOM-free and unit-tested; `view/` does the browser side
  effects** and is exercised via the demo. `generate-qr.ts` is `core/`: it
  touches no DOM.
- No `index.ts` barrel — consumers import the specific file they need.

---

## `core/pack-tour.ts` internals

1. **Missing-asset check.** Collect every `AssetId` in `tour.assets` with no entry
   in `assetFiles`. If any, throw `PackagingError` listing **all** of them.
2. **Entry-path check (decision 12).** For the `filename` set, throw
   `PackagingError` if any is:
   - a **duplicate** of another entry's filename (fflate would silently
     overwrite → an asset missing from the ZIP with no error), or
   - **unsafe**: absolute (`/…`), drive-lettered, contains a `..` segment, a
     backslash, or is empty. Also reject a collision with `tour.json` itself.
3. Read each `File` as an `ArrayBuffer` (via `file.arrayBuffer()`).
4. Build the `fflate` zip object: one entry per asset at `entry.filename` with
   `{ level: 0 }` (store mode). Add `tour.json` as UTF-8 bytes, also `{ level: 0 }`.
5. Call `fflate.zip` (async, promisified — decision 14) and return a `Blob` with
   `type: "application/zip"`.

`tour.json` entry path: `"tour.json"` (root of the ZIP).
Asset entry path: `entry.filename` verbatim (e.g. `"assets/knight.glb"`).

---

## `core/asset-filename.ts` internals

```ts
export function assetFilename(id: AssetId, file: File): string {
  const dot = file.name.lastIndexOf(".");
  // dot > 0: a leading dot is a dotfile (".glb"), not an extension.
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : "";
  return `assets/${id}${ext}`;
}
```

Pure. Two edge rules worth stating because they are the tested ones:
`dot > 0` (not `includes(".")`) so `".glb"` yields no extension rather than
`assets/id.glb` built from a dotfile; extension lowercased so `"MODEL.GLB"` and
`"model.glb"` cannot produce two entries differing only in case (a duplicate on
case-insensitive filesystems).

No validation of `id` here — but `packTour` rejects the resulting unsafe path
(decision 12), so a bad id fails loudly at pack time rather than producing a
nested/escaping ZIP entry.

---

## `core/build-tour-url.ts` internals

```ts
export function buildTourUrl(appBaseUrl: string, zipUrl: string): string {
  const url = new URL(appBaseUrl);
  url.searchParams.set("tour", zipUrl); // URLSearchParams percent-encodes
  return url.toString();
}
```

`URLSearchParams.set` does the encoding, so a presigned URL with `?X-Amz-…&…`
survives round-tripping. Contract D13: the presence of `?tour=` is exactly what
switches the app to viewing mode, so this is the seam between components 5 and 6.

---

## `core/generate-qr.ts` internals

Thin wrapper around `qrcode.toString(url, { type: "svg", errorCorrectionLevel, margin, width })`.
Returns the SVG string. Options are pinned in this module (not caller-supplied):

- `errorCorrectionLevel: "M"` — a presigned zip URL is long, so the QR is already
  dense; `M` (~15% recovery) keeps the module count scannable on a phone where
  `Q`/`H` would not. A printed-and-weathered sign would want `H`; a screen does not.
- `margin: 2`, `width: 512` — quiet zone + a size that scans from ~30 cm.

---

## Tests

### `core/asset-filename.test.ts`
- `assetFilename("knight", new File([], "model.glb"))` → `"assets/knight.glb"`
- `assetFilename("img", new File([], "photo.jpg"))` → `"assets/img.jpg"`
- No extension in original filename → `"assets/id"` (no trailing dot)
- **Dotfile** `new File([], ".glb")` → `"assets/id"` (leading dot is not an extension)
- **Multi-dot** `new File([], "model.v2.glb")` → `"assets/id.glb"` (last dot wins)
- **Uppercase** `new File([], "MODEL.GLB")` → `"assets/id.glb"` (lowercased)

### `core/build-tour-url.test.ts`
- Plain zip URL → `?tour=` param round-trips via `new URL(result).searchParams.get("tour")`
- **Presigned URL** with `?` and `&` → round-trips byte-identical (the regression this helper exists for)
- App base that already has a query/hash → param added, existing parts preserved

### `core/pack-tour.test.ts`
- **Happy path:** sample fixture + matching `Map<AssetId, File>`. Assert:
  - returned value is a `Blob` of type `application/zip`
  - ZIP contains `tour.json` — parse and assert it round-trips through `validateTour`
  - ZIP contains every `AssetEntry.filename` from the tour, bytes equal to the input `File`
  - **store mode, every entry:** method `0x0000` in the **local header** *and* in the
    **central directory** (component 6 range-reads the central directory — that is
    the field that actually matters), and `compressedSize === uncompressedSize`.
    Helpers `getLocalCompressionMethod` / `getCentralDirectoryEntries`.
- **Missing asset:** one id absent from the map → `PackagingError`, message includes
  the missing id, no Blob produced.
- **Multiple missing assets:** all missing ids listed in one throw (not just the first).
- **Duplicate filename:** two `AssetEntry`s with the same `filename` → `PackagingError`
  (not a ZIP that silently lost one asset).
- **Unsafe paths:** `"../escape.glb"`, `"/abs.glb"`, `"a\\b.glb"`, `""`, and
  `"tour.json"` each → `PackagingError`.
- **Round-trip with component 3:** `selectExportedTour` on an authoring store →
  `packTour` → extract `tour.json` from ZIP → `validateTour` passes and result
  equals the exported tour.

### `core/generate-qr.test.ts`
- `vi.mock("qrcode")` (module mock — spying on the ESM default export's method
  directly does not work) → assert `toString` called with the expected URL and the
  pinned options object.
- Assert the returned string is the mocked SVG (non-empty).

---

## Demo page (`components/packaging/index.html` + `demo.ts`)

Layout — two columns:

**Left — Tour input:**
- "Load sample tour" button: loads `store/fixtures/sample-tour.ts`, populates the
  tour state display.
- File inputs to override sample assets. Each picked `File` is turned into an
  `AssetEntry` via **`assetFilename(id, file)`** — this is the demo exercising the
  real authoring-UI path, and it is also what keeps `assetFilename` from tripping
  `check:deadcode` (see Tooling).
- "Pack tour" button: `packTour` → `view/download-blob.ts` triggers a `tour.zip` download.
- Status line: success (ZIP size) or error (missing ids / bad paths).

**Right — QR code:**
- `<input type="url">` "App base URL" (defaults to `location.origin + location.pathname`).
- `<input type="url">` "Hosted ZIP URL (paste after upload)".
- "Generate QR": `buildTourUrl(appBase, zipUrl)` → `generateQr(...)` →
  `view/qr-view.ts` renders the SVG inline, with the resulting URL shown as text
  underneath so it can be checked without a phone.

No Three.js, no GPS, no framework store — just the packaging utilities and the
sample fixture.

**Known gap (deferred):** "works out of the box" needs real asset bytes for every
`AssetEntry` in the fixture, fetched from `public/packaging/` into `File`s.
`public/` currently holds only `billboard/`. Until those fixture files land, the
demo can pack only after the author picks files. Also note the per-asset-type file
inputs do not generalise to a fixture with two assets of one type — revisit when
wiring the real sample assets.

---

## Tooling changes

`components/packaging/` is inside the `components/` glob that the existing checks
scan (`jscpd`, `depcruise`, `tsconfig.app.json` `include: ["components/**/*.ts"]`,
`vitest` `include: ["components/**/*.test.ts"]` — all confirmed by reading the
configs, not assumed). `check:cycles` walks `./components/*/demo.ts`, so the new
modules are only cycle-checked through `demo.ts` imports — which the demo does.

Actual changes needed:

- **`package.json`**: add dependencies **`fflate`**, **`qrcode`**; devDependency
  **`@types/qrcode`** (the `qrcode` package ships no types — decision 2).
- **`vite.config.ts`**: add `packaging: resolve(__dirname, "components/packaging/index.html")` to `input`.
- **root `index.html`**: add a gallery card linking to `/components/packaging/`.
- **`check:deadcode` (knip)** risk: `assetFilename` is *not* called by `packTour`
  (decision 11 — the authoring UI builds `AssetEntry`, and component 10 does not
  exist yet), so a test-only export would be flagged. The demo calling it
  (see above) is what resolves this.

---

## Verification

1. `pnpm run test:unit` — all packaging tests pass, including the store-mode
   raw-bytes check. **Confirm the `File` / `file.arrayBuffer()` globals resolve**:
   `vitest.config.ts` sets no `environment`, so tests run in Node (≥20 provides
   both) — if they don't, add `environment: "jsdom"` scoped to this suite.
2. `pnpm run dev` → open `/components/packaging/`:
   - "Load sample tour" → state display populates.
   - "Pack tour" → `tour.zip` downloads; open it in any ZIP inspector and confirm
     every entry shows "Store" (not "Deflate").
   - Extract `tour.json` and run `validateTour` in the console — no errors.
   - Paste app base + a real upload URL → "Generate QR" → SVG renders → scan with a
     phone → the URL opens with the `?tour=` param intact.
3. `pnpm run test:core` — the full gate (format, lint, lint:css, jscpd, cycles,
   boundaries, deadcode, typecheck, typecheck:tests, **and** `test:unit`) passes.
   This supersedes step 1; step 1 is just the fast inner loop.

---

## Deliverable ordering

Each step lands with its tests **and** its directory `README.md` in the same commit.

1. `core/asset-filename.ts` — needed by the authoring UI and by the demo.
2. `core/build-tour-url.ts`.
3. `core/pack-tour.ts` (missing-asset + path-safety checks, store-mode raw-bytes
   check, round-trip with component 3).
4. `core/generate-qr.ts`.
5. `view/` + demo page + tooling wiring (deps, vite input, gallery card).
