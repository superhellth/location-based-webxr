# cloud-loader / view

The I/O transport + orchestration for Component 6. Everything here touches the
network, zip.js, `URL.createObjectURL`, or the Cache API — so it is exercised by
the integration test (real fixture server) and the demo, not the pure unit suite.

## Purpose

- **`open-remote-tour.ts`** — `openRemoteTour(zipUrl, opts)`, the viewing entry
  point (C3). `normalizeShareUrl` (a pasted Dropbox/Drive/OneDrive/GitHub share
  page becomes the raw download URL; anything else passes through) → probe →
  zip.js central-directory parse (exactly once per open) →
  `parseTourJson` (validate) → build `RefCountedAssetProvider` → kick off the
  background warm. When ranges work but no size is readable anywhere it degrades
  to one bounded plain download instead of rejecting. Owns no store and no
  `?tour=` parsing; composition does the dispatch. `fetch`, the local cache
  store, and the URL minter are injected so the whole flow runs in Node (C20).
- **`remote-range-byte-source.ts`** — `probeRemote` (HEAD for size via safelisted
  `Content-Length` + `bytes=0-0` GET for support, C5; falls back to the 206's
  `Content-Range` for size when HEAD gives none — the CORS-proxy path) and
  `RemoteRangeByteSource` (per-read Range fetch). Every fetch carries an abort
  timeout so a hung connection becomes a rejection the retry policy can act on;
  a 4xx range read (expired signed link, file gone) fails as
  `StructuralAssetError` — permanent, never retried.
- **`local-cache-source.ts`** — `LocalCacheByteSource` (reads by slicing a held
  Blob — lazy, no heap blow-up) and `LocalCacheStore` (`get`/`put`/`delete`) with
  two backings: `InMemoryLocalCacheStore` (Node tests) and `CacheApiStore`
  (browser; requests `storage.persist()`, evicts via `delete`, C18).
- **`byte-source-reader.ts`** — `ByteSourceReader`, the zip.js `Reader` adapter
  whose `readUint8Array` delegates to the current `ByteSource` (C1/C2).
- **`fixture-server.ts`** — the toggleable local HTTP server (C9) that serves a
  real `packTour` zip under path-selected modes (`ranges-ok`, `no-ranges`,
  `no-head-len`→size only via Content-Range, `no-size`→no size anywhere,
  `corrupt`, `empty`→416, `missing`→404, `no-cors`→drop, plus caller-crafted
  zips). Shared by the integration test.

## Public API

```ts
function openRemoteTour(
  zipUrl: string,
  opts?: OpenRemoteTourOptions,
): Promise<OpenedTour>;
// OpenedTour = { tour: Tour; assetProvider: AssetProvider; cacheWarming: Promise<void> }
```

## Invariants

- `openRemoteTour` throws **`TourLoadError`** for every fatal load failure
  (unusable/CORS link, corrupt zip, missing/invalid tour.json, an asset filename
  absent from the zip — the contract invariant-3 check, C11). It never resolves
  with a partial tour.
- A warm download whose byte size differs from the archive the zip was parsed
  against (redirect page, truncated body) counts as a failed attempt — it is
  neither cached nor switched to.
- `cacheWarming` **never rejects** — a failed warm (after bounded backoff) simply
  stays on remote; the tour keeps working via Range reads.
- The zip.js reader is deliberately **not closed** — entries are read lazily for
  the tour's whole lifetime, through whichever `ByteSource` is current.
- A cached copy is **validated before it short-circuits the network**: if it no
  longer parses as a zip (a truncated/corrupt warm from an earlier broken run) it
  is evicted (`LocalCacheStore.delete`) and the open falls through to a fresh
  remote fetch — one bad warm can't brick a tour URL permanently.

## Known gaps (Option B, C19)

- Real Cache API transport and real browser **CORS** enforcement are **not** in
  the Node suite (`caches` is browser-only; undici doesn't enforce CORS). Both are
  proven in the manual demo. Playwright is the future path to automate them.
- `storage.estimate()` quota pre-check and the "start warm only after the first
  prefetch" gate (C16) are deferred; the warm currently starts eagerly at
  `priority: "low"` and `storage.persist()` is requested on write.

## Tests

`cloud-loader.integration.test.ts` — 12 scenarios against the fixture server:
happy-path range read (206), remote→local switch (no network after warm),
range-refused fallback (200), size-less-ranges full-download degrade
(`no-size`), the `missing`/`empty`/`corrupt`/`no-cors`/`asset-missing-in-zip`
error quartet+one, cache reuse on reload, and eviction of a poisoned cached
copy (falls back to the network and re-warms).
`remote-range-byte-source.test.ts` — the browser-`fetch` receiver brand check,
the abort-signal presence, and the 4xx-structural / 5xx-transient split.
