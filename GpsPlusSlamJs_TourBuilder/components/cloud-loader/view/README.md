# cloud-loader / view

The I/O transport + orchestration for Component 6. Everything here touches the
network, zip.js, `URL.createObjectURL`, or the Cache API — so it is exercised by
the integration test (real fixture server) and the demo, not the pure unit suite.

## Purpose

- **`open-remote-tour.ts`** — `openRemoteTour(zipUrl, opts)`, the viewing entry
  point (C3). Probe → zip.js central-directory parse → `parseTourJson` (validate)
  → build `RangeZipAssetProvider` → kick off the background warm. Owns no store
  and no `?tour=` parsing; composition does the dispatch. `fetch`, the local
  cache store, and the URL minter are injected so the whole flow runs in Node
  (C20).
- **`remote-range-byte-source.ts`** — `probeRemote` (HEAD for size via safelisted
  `Content-Length` + `bytes=0-0` GET for support, C5; falls back to the 206's
  `Content-Range` for size when HEAD gives none — the CORS-proxy path) and
  `RemoteRangeByteSource` (per-read Range fetch).
- **`local-cache-source.ts`** — `LocalCacheByteSource` (reads by slicing a held
  Blob — lazy, no heap blow-up) and `LocalCacheStore` (`get`/`put`/`delete`) with
  two backings: `InMemoryLocalCacheStore` (Node tests) and `CacheApiStore`
  (browser; requests `storage.persist()`, writes under a temp key promoted on
  completion, evicts via `delete`, C18).
- **`byte-source-reader.ts`** — `ByteSourceReader`, the zip.js `Reader` adapter
  whose `readUint8Array` delegates to the current `ByteSource` (C1/C2).
- **`fixture-server.ts`** — the toggleable local HTTP server (C9) that serves a
  real `packTour` zip under path-selected modes (`ranges-ok`, `no-ranges`,
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

`cloud-loader.integration.test.ts` — 10 scenarios against the fixture server:
happy-path range read (206), remote→local switch (no network after warm),
range-refused fallback (200), the `missing`/`empty`/`corrupt`/`no-cors`/
`asset-missing-in-zip` error quartet+one, cache reuse on reload, and eviction of
a poisoned cached copy (falls back to the network and re-warms).
