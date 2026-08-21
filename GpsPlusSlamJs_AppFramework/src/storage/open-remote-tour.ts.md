# open-remote-tour.ts

## Purpose

Turns a hosted zip archive URL into ready-to-use content: probe the host's
Range support → read the central directory + a manifest entry (`tour.json`)
→ build an `AssetProvider` for the archive's other entries → kick off a
background full-download that warms a local copy and switches the transport
over once ready. Falls back to a plain full download when a host serves the
whole file but refuses ranges, or ranges without exposing a readable size.

Generic over the manifest shape: the caller supplies `parseTour`, so this
module never imports (or knows about) any app-specific manifest type — it
only needs the parsed result to expose `.assets` (id/filename/type), which is
everything it needs to serve asset bytes by id. URL parsing (e.g. reading a
`?tour=` query param) and any app store dispatch are the caller's job, not
this module's.

## Public API

- **`OpenRemoteTourOptions`** — `{ localCacheStore?, fetchImpl?, createObjectUrl?, revokeObjectUrl?, googleDriveApiKey? }`.
  `fetchImpl` defaults to the global `fetch`; `localCacheStore` defaults to a
  `CacheApiStore` in the browser or an `InMemoryLocalCacheStore` in Node.
- **`MinimalAsset`** — `{ id: string, filename: string, type: string }`.
- **`MinimalParsedArchive`** — `{ assets: readonly MinimalAsset[] }`; the
  structural constraint `parseTour`'s return type `T` must satisfy.
- **`OpenedTour<T>`** — `{ tour: T, assetProvider: AssetProvider, cacheWarming: Promise<void> }`.
  `cacheWarming` never rejects — a failed warm just stays on remote.
- **`openRemoteTour<T extends MinimalParsedArchive>(zipUrl: string, parseTour: (text: string) => T, opts?: OpenRemoteTourOptions): Promise<OpenedTour<T>>`**.

## Invariants & assumptions

- A pasted share-page link (Dropbox/Drive/GitHub/OneDrive) is normalized to
  its raw-bytes URL before anything else runs, so probing/caching/byte
  sources all see one canonical URL.
- A cached local copy from a previous session is reused only if it still
  parses as a zip; a poisoned (truncated/corrupt) cache entry is evicted and
  the load falls through to a fresh network open, so one broken warm can
  never brick a URL permanently.
- Every asset referenced by the parsed manifest must have a matching entry in
  the zip's central directory, or the whole load throws
  `TourLoadError('asset-missing-in-zip', …)` before any asset is served.
- `parseTour` throwing is caught and re-thrown as
  `TourLoadError('invalid-tour-json', …)` — `openRemoteTour` does not
  validate the manifest itself, only that parsing succeeds.
- The background warm retries up to 3 times with backoff (2s/8s/30s); on
  exhaustion it gives up silently and the tour keeps working via Range reads.
- Depends on `@zip.js/zip.js` and, within this module, `asset-provider.ts`,
  `byte-source.ts`, `range-probe.ts`, `tour-load-error.ts`,
  `mime-for-asset.ts`, `share-link.ts`, `zip-byte-source-reader.ts`,
  `local-cache-byte-source.ts`, `remote-range-byte-source.ts`.

## Examples

```ts
import { openRemoteTour } from 'gps-plus-slam-app-framework/storage';

interface Tour {
  readonly id: string;
  readonly assets: readonly { id: string; filename: string; type: string }[];
}

const { tour, assetProvider, cacheWarming } = await openRemoteTour(
  zipUrl,
  (text) => JSON.parse(text) as Tour // or your own validating parser
);
const url = await assetProvider.getAssetUrl(tour.assets[0].id);
```

## Tests

- `open-remote-tour.integration.test.ts` — the real orchestrator (probe,
  zip.js central-directory parse, manifest parse, asset provider, warm +
  switch) against a real local HTTP server that speaks real
  206/Content-Range and can be toggled to refuse ranges, 404, 416, corrupt
  bytes, or drop the connection (`caches`-absent CORS approximation). Covers
  the range-capable path, the range-refusing fallback, sizing from
  Content-Range when HEAD omits Content-Length, the full-download degrade
  when no size is readable anywhere, every `TourLoadError` cause, and reload
  reusing (or evicting a poisoned) local cache.
