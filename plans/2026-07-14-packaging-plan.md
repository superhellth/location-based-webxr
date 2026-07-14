# 2026-07-14 — Component 5: Tour Packaging & QR Code (implementation plan)

## Context

Component 5 is the **authoring-side export step**: take a `Tour` (from
`selectExportedTour`) plus the author's asset `File` objects, bundle them into a
single `tour.zip` stored **uncompressed** (ZIP "store" mode, no DEFLATE), and
provide a separate utility to generate a QR code whose URL opens the app in viewing
mode pointed at the hosted ZIP.

The uncompressed constraint is deliberate: component 6 range-reads individual
assets as cheap byte-slices without a decompression step. DEFLATE would save almost
nothing because tour assets are already-compressed formats (GLB, MP3/OGG, JPG/PNG).

The contract is **already agreed** in `plans/Shared-Contract.md`. This plan
implements it. The design below was resolved in a grilling on 2026-07-14.

Package: **`GpsPlusSlamJs_TourBuilder/`**. All logic + demo live under
`components/packaging/` (mirrors the billboard / in-world-text / proximity layout).

---

## Decisions (resolved in the 2026-07-14 grilling)

| # | Branch | Decision |
|---|--------|----------|
| 1 | ZIP library | **`fflate`** — tiny, tree-shakeable, clean `level: 0` per-entry API for store mode. |
| 2 | QR library | **`qrcode`** — minimal, well-typed, outputs SVG. |
| 3 | Code location | `components/packaging/` — logic + demo colocated, mirrors components 1–4 layout. |
| 4 | `packTour` signature | `packTour(tour: Tour, assetFiles: Map<AssetId, File>): Promise<Blob>` — keyed map prevents silent filename mismatches. |
| 5 | Validation inside `packTour` | **No** — precondition: caller has a valid `Tour` (typed; `selectExportedTour` guarantees it). Documented in sidecar. |
| 6 | ZIP layout | `AssetEntry.filename` used **verbatim** as the ZIP entry path. Component 6 looks up entries by `entry.filename` with no translation. |
| 7 | QR generation | **Separate function** `generateQr(tourUrl: string): Promise<string>` returns an SVG string. `packTour` produces the ZIP only. |
| 8 | Demo | Pre-loads sample fixture (works out of the box) + file inputs to override with real assets. Text input for the hosted URL feeds `generateQr`. |
| 9a | ZIP store-mode test | Inspect raw bytes — assert compression method field `0x0000` for every entry. |
| 9b | QR test | **Spy on `qrcode`** — assert it was called with the correct URL string. |
| 10 | Missing asset error | **Throw immediately** with message listing missing ids. Never produce a partial ZIP. |
| 11 | Filename convention | **`assetFilename(id, file): string`** pure helper → `assets/<id>.<ext>`. Used by the authoring UI when building `AssetEntry` and documented as the convention `packTour` relies on. |

---

## Public API

```ts
// components/packaging/pack-tour.ts
import type { Tour, AssetId } from "../../store/types.js";

/**
 * Bundle a tour into an uncompressed ZIP Blob.
 *
 * @precondition `tour` has passed `validateTour` (or was produced by
 * `selectExportedTour` from the authoring slice).
 * @throws {PackagingError} if any AssetId in `tour.assets` has no
 * corresponding File in `assetFiles`.
 */
export function packTour(
  tour: Tour,
  assetFiles: Map<AssetId, File>,
): Promise<Blob>;

export class PackagingError extends Error {}

// components/packaging/asset-filename.ts
/**
 * Canonical filename for an asset inside tour.zip.
 * Used by the authoring UI (when building AssetEntry) and relied on by packTour.
 * Convention: assets/<id>.<original-extension>
 */
export function assetFilename(id: AssetId, file: File): string;

// components/packaging/generate-qr.ts
/**
 * Generate an SVG QR code whose data is `tourUrl`.
 * The caller provides the full app URL including the ?tour= parameter.
 */
export function generateQr(tourUrl: string): Promise<string>;
```

---

## File layout

```
components/packaging/
  pack-tour.ts           # packTour() — ZIP assembly with fflate
  pack-tour.ts.md        # sidecar: Purpose / Public API / Invariants / Examples / Tests
  asset-filename.ts      # assetFilename() helper
  asset-filename.ts.md
  generate-qr.ts         # generateQr() — SVG QR via qrcode
  generate-qr.ts.md
  packaging.test.ts      # all unit tests
  index.html             # demo page
  demo.ts                # demo control panel
```

No `index.ts` barrel — consumers import the specific file they need, consistent
with the rest of the package.

---

## `pack-tour.ts` internals

1. Validate the asset map: collect every `AssetId` in `tour.assets` that has no
   entry in `assetFiles`. If any are missing, throw `PackagingError` with the list.
2. Read each `File` as an `ArrayBuffer` (via `file.arrayBuffer()`).
3. Build the `fflate` zip object: one entry per asset at `entry.filename` with
   `level: 0` (store mode). Add `tour.json` as UTF-8 bytes, also `level: 0`.
4. Call `fflate.zipSync` (or `fflate.zip` for the async variant) and return a
   `Blob` with `type: 'application/zip'`.

`tour.json` entry path: `"tour.json"` (root of the ZIP).
Asset entry path: `entry.filename` verbatim (e.g. `"assets/knight.glb"`).

---

## `asset-filename.ts` internals

```ts
export function assetFilename(id: AssetId, file: File): string {
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : "";
  return `assets/${id}${ext}`;
}
```

Pure function. No validation — the authoring UI is responsible for only passing
valid `File` objects.

---

## `generate-qr.ts` internals

Thin wrapper around `qrcode.toString(url, { type: "svg" })`. Returns the SVG
string. The caller supplies the full URL including `?tour=<zip-url>`.

---

## Tests (`packaging.test.ts`)

### `assetFilename`
- `assetFilename("knight", new File([], "model.glb"))` → `"assets/knight.glb"`
- `assetFilename("img", new File([], "photo.jpg"))` → `"assets/img.jpg"`
- No extension in original filename → `"assets/id"` (no trailing dot)

### `packTour`
- **Happy path:** pack the sample fixture + matching `Map<AssetId, File>`. Assert:
  - returned value is a `Blob` of type `application/zip`
  - ZIP contains `tour.json` — parse and assert it round-trips through `validateTour`
  - ZIP contains every `AssetEntry.filename` from the tour
  - **every entry has compression method `0x0000`** (raw bytes check, helper
    `getCompressionMethod(zipBytes, entryName)`)
- **Missing asset:** one id absent from the map → `PackagingError` thrown, message
  includes the missing id, no Blob produced.
- **Multiple missing assets:** all missing ids listed in one throw (not just the first).
- **Round-trip with component 3:** `selectExportedTour` on an authoring store →
  `packTour` → extract `tour.json` from ZIP → `validateTour` passes and result
  equals the exported tour.

### `generateQr`
- Spy on `qrcode.toString` — assert called with the expected URL and `{ type: "svg" }`.
- Assert returned string is non-empty.

---

## Demo page (`components/packaging/index.html` + `demo.ts`)

Layout — two columns:

**Left — Tour input:**
- "Load sample tour" button: pre-loads `store/fixtures/sample-tour.ts` and
  populates the tour state display.
- File inputs (one per asset type: sprite, model, audio) to override sample assets.
- "Pack tour" button: calls `packTour`, triggers a browser download of `tour.zip`.
- Status line: shows success (ZIP size) or error (missing ids).

**Right — QR code:**
- `<input type="url">` labelled "Hosted ZIP URL (paste after upload)".
- "Generate QR" button: calls `generateQr(url)`, renders the returned SVG inline.
- The SVG is displayed large enough to scan with a phone.

No Three.js, no GPS, no framework store — just the packaging utilities and the
sample fixture.

---

## Tooling changes

Same pattern as component 3 (`store/`) — `components/packaging/` is already inside
the `components/` glob that existing checks scan, so no tooling changes are needed
beyond:

- **`vite.config.ts`**: add `packaging: resolve(__dirname, "components/packaging/index.html")` to `input`.
- **`root index.html`**: add a gallery card linking to `/components/packaging/`.
- Verify `tsconfig.app.json` / `tsconfig.vitest.json` `include` already covers
  `components/**` (it does — confirm before writing code).

---

## Verification

1. `pnpm run test:unit` — all packaging tests pass, including the raw-bytes
   store-mode check.
2. `pnpm run typecheck` — no errors.
3. `pnpm run dev` → open `/components/packaging/`:
   - Click "Load sample tour" → state display populates.
   - Click "Pack tour" → `tour.zip` downloads; open it in any ZIP inspector and
     confirm every entry shows "Store" (not "Deflate").
   - Extract `tour.json` and run `validateTour` in the console — no errors.
   - Paste a real upload URL → click "Generate QR" → SVG renders → scan with phone →
     URL opens correctly.
4. `pnpm run test:core` — full gate (format, lint, jscpd, cycles, boundaries,
   deadcode, typecheck) passes.

---

## Deliverable ordering

1. `asset-filename.ts` + tests — first, it's needed by the authoring UI and by
   `packTour`.
2. `pack-tour.ts` + tests (including raw-bytes store-mode check + round-trip).
3. `generate-qr.ts` + tests.
4. Demo page + tooling wiring.
5. Sidecar `.md` files for every behavior file — same commit as the code.
