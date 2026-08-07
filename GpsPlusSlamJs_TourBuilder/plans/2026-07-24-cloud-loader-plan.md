# 2026-07-24 — Component 6: Cloud-storage tour source + asset-provider (implementation plan)

## Context

Component 6 is the **viewing-side loader**: it turns a plain shared link
(`?tour=<zipUrl>`) into a running tour. Given the hosted `tour.zip` (uncompressed,
produced by component 5), it:

1. Opens the zip **over the network by byte range** — reading the central directory
   and the small `tour.json` first, so the tour starts almost instantly.
2. Parses `tour.json` (via the shared `validateTour`) so composition can dispatch
   `loadTour` + `initZones`.
3. Implements the §2.2 / Shared-Contract **`AssetProvider`** (`RangeZipAssetProvider`)
   so the rest of the app asks for an asset by id and gets a Blob URL on demand,
   without ever downloading the whole archive up front.
4. Runs the §2.5.4 **background cache-warming + remote→local byte-source switch**,
   and **falls back** to a full download if the link serves the whole file but does
   not support ranges (or blocks CORS in a recoverable way).

The contract is **already agreed** in `plans/Shared-Contract.md` (D14: asset-provider
shape; §3: the two-tier memory model — this component owns **tier 1**, the Blob/Blob-URL,
only). This plan implements the viewing backing of that contract. The design below was
resolved in a grilling on 2026-07-24.

Package: **`GpsPlusSlamJs_TourBuilder/`**, directory `components/cloud-loader/`, split
`core/` (pure policy) + `view/` (I/O transport) + `demo.ts` like components 1–5. The
class named in the contract stays **`RangeZipAssetProvider`**; the *directory* describes
the job.

This component is **not GPS-driven** — it has no outdoor-recording replay e2e. Its
integration proof is a vitest test against a local fixture HTTP server.

---

## Decisions (resolved in the 2026-07-24 grilling)

| # | Branch | Decision |
|---|--------|----------|
| C1 | Byte-source seam | **Own `ByteSource { read(offset, length): Promise<Uint8Array> }` + a thin zip.js `Reader` subclass** whose `readUint8Array` delegates to the *current* source. **Not** zip.js's built-in `HttpRangeReader` — it's HTTP-only, sealed (no remote→local switch), and untestable against a fake. zip.js stays only as the central-directory/entry parser. |
| C2 | Zip library | **Reuse `@zip.js/zip.js`** — already a framework dependency; exposes the abstract `Reader<Type>` (`init()` + `readUint8Array(offset,length)`) that is exactly the swap seam. Must be **added to TourBuilder's `package.json`** (currently a framework-only dep). |
| C3 | Location & boundary | `components/cloud-loader/`. Component 6 exposes **`openRemoteTour(zipUrl)`** + `RangeZipAssetProvider` and does **not** read `location.href`, build the store, or dispatch. Composition (Goal 2) reads `?tour=`, calls `openRemoteTour`, then dispatches `loadTour` + `initZones` and injects the provider. Keeps component 6 Redux-free and URL-free (D13). |
| C4 | Local cache backend | **Cache API** — full zip stored as a `Response` keyed by zip URL; `LocalCacheByteSource` holds the resolved `Blob` and serves `blob.slice(off, off+len).arrayBuffer()` (lazy random access, no heap blow-up). Chosen over IndexedDB (ArrayBuffer = heap; slice reads need manual chunking) and OPFS (framework's `OpfsStorageBackend` is session-shaped — reuse would mean net-new OPFS code anyway). Same primitive §2.5.7's offline PWA builds on. |
| C5 | Probe / size / range-detection | Two small requests: **HEAD → total size from `Content-Length`** (CORS-safelisted, universally readable cross-origin), plus **`GET Range: bytes=0-0`** to detect support: `206`→on-demand ranges; `200`→server ignored Range, so **capture that full body as the eager-local fallback** (same ingest routine as cache-warm). `Content-Range` is **not** relied on (needs `Access-Control-Expose-Headers`, provider-dependent). |
| C6 | Failure branches of the probe | `416`/truncated → `TourLoadError` (corrupt/empty). `404` → `TourLoadError` (missing). `fetch` reject / unreadable opaque response (CORS block) → `TourLoadError` (unusable link, unrecoverable — CORS blocks *both* range and full-body paths). Surfaced to the onboarding gate as "this tour link isn't usable." |
| C7 | Provider-specific link transforms | **None in code.** `openRemoteTour` fetches the given URL and follows redirects only (handles OneDrive/Box 302 automatically); zero per-host branching. Provider quirks live in **`RECIPE.md`**, not code. The `?tour=` value is assumed to be a ready-to-fetch direct download URL (matches packaging's `buildTourUrl` contract). |
| C8 | Demonstrated provider | **Dropbox** for the manual demo (clean 206 + CORS, no OAuth / signed-URL expiry / virus-scan interstitial). **`RECIPE.md` documents GitHub** (`raw.githubusercontent.com` — probed: `206` + `ACAO:*`, size via HEAD `Content-Length`; caveats: 100 MB/file cap, off-spec vs §2.5.6) as the zero-friction alternative, and the Dropbox demo steps so the demo is reproducible. |
| C9 | Fixture server (tests) | One real `http.createServer`, ephemeral port, path-selected modes, fed a `packTour`-built zip (exercises real component-5 output). Modes: `/ranges-ok`, `/no-ranges` (200 full body), `/no-cors`, `/corrupt`, `/missing` (404), `/short` (416 past EOF). Real server over mocked `fetch` — real 206/`Content-Range`/redirect semantics. |
| C10 | CORS-block test split | Node's `fetch` (undici) does **not** enforce CORS, so `/no-cors/` is faked at the **connection level** (network-error reject) in the Node integration test, proving "fetch-rejects → clean `TourLoadError`". Real browser CORS enforcement is proven in the **manual demo** (Option B, C16). |
| C11 | `id → bytes` join & load-time validation | Provider builds `Map<AssetId, Entry>` once by joining `tour.assets` (`AssetEntry.filename`, verbatim per packaging decision 6) against zip.js's parsed entries. Contract **invariant 3** (every referenced filename present in the zip) is **verified here at load** → a broken reference is a **fatal `TourLoadError`**, not a soft per-asset skip. |
| C12 | `getAssetUrl` mechanics | Look up `Entry` → `entry.getData(new BlobWriter(mime))` (bytes pulled through the current `ByteSource`; store-mode = no decompression) → `URL.createObjectURL`. MIME from `AssetType` (`model`→`model/gltf-binary`, `audio`→`audio/mpeg`|`audio/ogg`, `sprite`→image) so the Blob URL is directly usable by GLTFLoader/`<audio>`/`<img>`. |
| C13 | Ref-counting (D14a) | `Map<AssetId, { count; url; pending?: Promise<string> }>`. First call starts the fetch + stores `pending` (count 1); concurrent callers **await the same `pending`** and bump count (dedupe same-id fetches — matters for an audio id shared across waypoints). `release` decrements; at 0 → `revokeObjectURL` + delete. Calls must balance. |
| C14 | Error tiers | **`TourLoadError`** (from `openRemoteTour`): unusable URL / CORS / corrupt / missing-or-invalid `tour.json` / filename-not-in-zip → **fatal**. **`getAssetUrl` rejection** (per-asset, mid-tour): individual read failure → **soft** (component 8 leaves that waypoint visual-less, logs, tour survives). |
| C15 | Retry policy (production) | `getAssetUrl` **retries transient *network* errors with bounded backoff**; **structural** errors (entry missing, decode failure) fail immediately. Rationale: a visitor standing still at an ACTIVE waypoint gets no zone re-entry, so no-retry would strand them. |
| C16 | Cache-warm (production) | Detached, surfaced as returned `cacheWarming` promise. De-prioritized via `fetch(url,{priority:'low'})` **+ start-after-first-prefetch**. On failure: **bounded retry with exponential backoff** (~2s/8s/30s) then stay on remote (tour still works via ranges). Resumable-via-Range designed-for but **deferred** (tour never broken while warming). |
| C17 | remote→local switch | `SwitchableByteSource.readUint8Array` **captures `current` at call entry** then reads from the captured ref. Warm completion: build `LocalCacheByteSource`, `current = local`, set `switched` guard. ⇒ in-flight remote reads finish from remote; only new reads go local; `if(switched)return` makes it idempotent; lock-free (single-threaded, one synchronous assignment). |
| C18 | Persistent storage & quota (production) | `navigator.storage.persist()` (Cache API is evictable — required for the offline promise) and `navigator.storage.estimate()` quota check before warming a large zip. Cache written under a **temp key, promoted atomically** on completion, so an interrupted session never yields a half-written "local" source. Reuse a prior *complete* cache entry (skip warm, switch at once). |
| C19 | Test toolchain | **Option B — stay vitest/Node** (matches TourBuilder's convention; its "e2e" is a vitest replay test, not Playwright). Fixture-server integration tests + fake-seam policy tests. Cache-API transport + real CORS are **demo-proven**, not CI. Playwright noted as possible **future** setup. |
| C20 | Dependency injection for testability | `openRemoteTour(zipUrl, { localCacheStore?, fetchImpl? })` — defaults to real Cache API + global `fetch`, overridable. Lets the Node integration test run the **real orchestrator** against the fixture server with an in-memory cache sink (since `caches` is absent in Node). |

---

## Public API

```ts
// components/cloud-loader/core/byte-source.ts
/** Swappable random-access byte source. The single seam §2.5.4 is built on. */
export interface ByteSource {
  /** Total archive size in bytes (known after init/probe). */
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Holds a `current` ByteSource and swaps it atomically (C17). */
export class SwitchableByteSource implements ByteSource { /* … */ }

// components/cloud-loader/core/asset-provider.ts
import type { AssetProvider } from "../../../store/types.js"; // getAssetUrl / release (D14)

/** Viewing-mode AssetProvider backed by a ByteSource + zip central directory. */
export class RangeZipAssetProvider implements AssetProvider {
  getAssetUrl(id: AssetId): Promise<string>; // ref-counted, retry-transient (C13/C15)
  release(id: AssetId): void;                 // revokeObjectURL at count 0
}

// components/cloud-loader/core/errors.ts
export class TourLoadError extends Error {
  readonly cause: "unusable-link" | "cors" | "corrupt" | "missing"
    | "invalid-tour-json" | "asset-missing-in-zip";
}

// components/cloud-loader/view/open-remote-tour.ts
export interface OpenRemoteTourOptions {
  localCacheStore?: LocalCacheStore; // default: Cache API impl (C20)
  fetchImpl?: typeof fetch;          // default: global fetch
}
/**
 * Open a hosted tour.zip: probe → parse central directory + tour.json →
 * validateTour → build provider → kick off background warm.
 * @throws {TourLoadError} on any fatal load failure (C6/C11/C14).
 */
export function openRemoteTour(
  zipUrl: string,
  opts?: OpenRemoteTourOptions,
): Promise<{
  tour: Tour;                    // already validateTour'd
  assetProvider: AssetProvider;  // RangeZipAssetProvider
  cacheWarming: Promise<void>;   // resolves after local copy ready + switched (or stays-on-remote)
}>;
```

---

## File layout

```
components/cloud-loader/
  core/
    byte-source.ts          byte-source.test.ts       # ByteSource + SwitchableByteSource (capture-then-read, idempotent)
    fallback-decision.ts    fallback-decision.test.ts # probe result → { mode: ranges | eager-local | reject }
    asset-provider.ts       asset-provider.test.ts    # RangeZipAssetProvider vs fake ByteSource (ref-count, dedupe, retry, join)
    errors.ts
    README.md
  view/
    remote-byte-source.ts                             # HEAD size + Range GET + redirects (C5)
    local-cache-source.ts                             # LocalCacheStore (Cache API) + LocalCacheByteSource (C4/C18)
    open-remote-tour.ts                               # orchestrator (thin; wires the pure pieces) (C20)
    fixture-server.ts                                 # toggleable http.createServer (C9) — shared by test + demo
    cloud-loader.integration.test.ts                  # vitest, real orchestrator vs fixture server (C10/C19/C20)
    README.md
  demo.ts
  index.html
  RECIPE.md                                           # Dropbox demo steps + GitHub alternative (C8)
  README.md
```

Conventions (checked against the package, not assumed): per-directory `README.md`
(not per-file sidecars); one `*.test.ts` per source file colocated; `core/` pure &
unit-tested, `view/` browser/I-O side effects; no `index.ts` barrel. `open-remote-tour.ts`
sits in `view/` (it touches network) and stays thin.

**core/view purity line (softer than other components, stated deliberately):** the
byte-*transport* is inherently I/O and lives in `view/`; the *policy* — switch
sequencing, fallback decision, ref-count/retry bookkeeping, id→entry join, error types —
is pure and lives in `core/`, tested against fakes.

---

## Key internals

### `core/byte-source.ts` — `SwitchableByteSource` (C17)
```ts
read(offset, length) {
  const src = this.current;          // capture at entry
  return src.read(offset, length);   // in-flight reads finish from the captured source
}
switchTo(next: ByteSource) {
  if (this.switched) return;         // idempotent
  this.switched = true;
  this.current = next;               // one synchronous assignment; only *new* reads see it
}
```

### `core/fallback-decision.ts` (C5/C6) — pure
Input: `{ status: number; size: number | null; fullBody?: Uint8Array }` from the probe.
Output: `{ mode: "ranges" } | { mode: "eager-local"; body } | { mode: "reject"; cause }`.
`206`→ranges; `200`→eager-local (with captured body); `416`→reject(corrupt);
`404`→reject(missing); no size / fetch reject→reject(unusable-link|cors).

### `view/remote-byte-source.ts` (C5)
`init()`: HEAD → `size = Number(res.headers.get("content-length"))`; `GET Range: bytes=0-0`
→ feed status+body to `fallback-decision`. `read(off,len)`: `fetch(url,{headers:{Range:`bytes=${off}-${off+len-1}`}})`
→ `new Uint8Array(await res.arrayBuffer())`. Redirects followed by default.

### `view/local-cache-source.ts` (C4/C18)
`LocalCacheStore`: `has(url)`, `get(url): Promise<Blob>`, `putStreaming(url, response)`
(temp key → atomic promote), backed by Cache API. `LocalCacheByteSource` holds the
`Blob`, `read` = `blob.slice(off, off+len).arrayBuffer()`. Warm path calls
`storage.persist()` + `estimate()` before writing.

### `view/open-remote-tour.ts` (C11/C16/C20) — orchestrator
1. `remote.init()` (probe). On `reject` mode → throw `TourLoadError`. On `eager-local` →
   ingest captured body into cache, switch immediately, skip background warm.
2. zip.js `Reader` over the `SwitchableByteSource` → `getEntries()` (reads EOCD from tail
   via range). Read `tour.json` entry → `validateTour` (throw `TourLoadError` on fail).
3. Join `tour.assets` filenames against entries → throw `TourLoadError`(asset-missing) if any absent.
4. Build `RangeZipAssetProvider`. Return `{ tour, assetProvider, cacheWarming }`.
5. `cacheWarming` (unless eager-local already switched): after first prefetch, low-priority
   full GET streamed to cache with bounded-backoff retry; on success `switchTo(local)`.

---

## Tests

### Unit (core, vitest/Node, fakes — the bulk of correctness)
- **`byte-source.test.ts`**: capture-then-read (in-flight read completes from old source after
  `switchTo`); idempotent switch (second `switchTo` is a no-op); new read goes local.
- **`fallback-decision.test.ts`**: 206→ranges; 200→eager-local(body); 416→reject(corrupt);
  404→reject(missing); no-size→reject(unusable).
- **`asset-provider.test.ts`** (fake in-memory `ByteSource`): `getAssetUrl` resolves a usable
  Blob URL; `release` at count 0 revokes; concurrent same-id awaits one `pending` (single fetch);
  ref-count balance across shared-id waypoints; **transient network error → retried then resolves**;
  **structural (entry-missing) → immediate reject**; load-time filename-not-in-zip → fatal.

### Integration (vitest/Node, real orchestrator vs fixture server, C10/C19/C20)
Inject in-memory `localCacheStore` (Cache API absent in Node). Drive `openRemoteTour`:
- `/ranges-ok`: `tour` + waypoints available before warm resolves; a real `206` was issued;
  `getAssetUrl` returns bytes equal to the packed input.
- `/no-ranges`: 200 → eager-local fallback → tour + assets still usable.
- `/short`: 416 → `TourLoadError`(corrupt).
- `/corrupt`: garbage bytes → `TourLoadError`(corrupt).
- `/missing`: 404 → `TourLoadError`(missing).
- `/no-cors`: connection reject → `TourLoadError`(unusable/cors), no crash.
- switch: after warm completes against the injected store, source flips; a post-switch read
  hits the store, **not** the server (server request counter unchanged).

### Not covered in CI (Option B, demo-proven)
Real Cache API transport (`caches`) and real browser CORS enforcement. Documented gap;
Playwright is the future path to automate them (C19).

---

## Demo page (`index.html` + `demo.ts`, Dropbox, real network)

No Three.js / GPS / store — drives `openRemoteTour` + the provider directly, renders
text/log + `<img>`/`<audio>` from returned Blob URLs (mirrors the packaging demo's
framework-free style). Four beats:

1. **Instant start** — pre-filled Dropbox `?tour=` URL → "Load" → print parsed `Tour`
   (name, waypoint count, asset ids) while `cacheWarming` is still pending.
2. **Range fetch → 206** — a button per asset id calls `getAssetUrl`; the log prints the
   requested byte range + Blob URL + size; the **Network panel shows `206 Partial Content`**
   (the TASK-required proof).
3. **Warm → switch to local** — status line flips `source: remote (range)` → `source: local
   (cache)` when `cacheWarming` resolves; a subsequent `getAssetUrl` shows **no new network
   request**.
4. **Range-unsupported fallback** — a second input pointing at the **local fixture server's**
   `/no-ranges/` path (reliable — no everyday provider refuses ranges on demand); log reports
   "range unsupported → eager local", tour still loads.

---

## Tooling changes

- **`package.json`**: add dependency **`@zip.js/zip.js`** (framework-only today; confirmed
  absent from TourBuilder deps). No new devDeps (Option B — no Playwright).
- **`vite.config.ts`**: add `cloud-loader: resolve(__dirname, "components/cloud-loader/index.html")`
  to `input`.
- **root `index.html`**: add a gallery card linking `/components/cloud-loader/`.
- **`check:deadcode` (knip)**: the demo importing every public export keeps them un-flagged
  (same pattern packaging used for `assetFilename`).
- **`check:cycles`** walks `./components/*/demo.ts` — new modules are cycle-checked through
  `demo.ts` imports, which the demo provides.
- No Playwright config / CI browser install (deferred, C19).

---

## Verification

1. `pnpm exec vitest run components/cloud-loader/` — all unit + integration tests pass
   (fast inner loop).
2. `pnpm run dev` → open `/components/cloud-loader/`: run the four demo beats above; confirm
   a `206` in the Network panel, the remote→local source flip, and the `/no-ranges` fallback.
3. `pnpm test` (from `GpsPlusSlamJs_TourBuilder/`) — the full gate (format, lint, lint:css,
   jscpd, cycles, boundaries, deadcode, typecheck, typecheck:tests, test:unit) passes.

---

## Deliverable ordering

Each step lands with its tests **and** its directory `README.md` in the same commit (TDD).

1. `core/errors.ts` + `core/byte-source.ts` — `ByteSource` + `SwitchableByteSource`, fully
   unit-tested (capture-then-read, idempotent, in-flight-safe).
2. `core/fallback-decision.ts` — pure probe-result → strategy.
3. `core/asset-provider.ts` — `RangeZipAssetProvider` vs a fake `ByteSource` (ref-count,
   dedupe, retry, id→entry join). Bulk of the unit value, no network.
4. `view/remote-byte-source.ts` + `view/local-cache-source.ts` — the two real transports.
5. `view/open-remote-tour.ts` — orchestrator (probe + zip.js + validateTour + provider + warm),
   with DI hooks (C20).
6. `view/fixture-server.ts` + `cloud-loader.integration.test.ts` — deterministic integration proofs.
7. `demo.ts` + `index.html` + `RECIPE.md` + tooling wiring (dep, vite input, gallery card).
```
