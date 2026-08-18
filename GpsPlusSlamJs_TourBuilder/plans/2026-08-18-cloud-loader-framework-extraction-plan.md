# 2026-08-18 — Cloud-loader framework extraction (implementation plan)

## Context

Component 6 (`components/cloud-loader/`, `plans/2026-07-24-cloud-loader-plan.md`)
is done and merged. Most of it turns out to be **GPS-free, tour-free byte
transport**: a swappable range-read/local-cache byte source and a zip.js
adapter over it. Only the outer orchestrator actually knows what a "tour" is.

This mirrors two prior extractions already merged upstream-shaped:
`397b3416`/`bb538e1b` (`packFilesAsZip`) and `75d776a0`/`bbf401e1`
(`generateQr`) — a `feat(framework): …` commit followed by a
`refactor(tourbuilder): … thin adapter` commit, landed together on a
`feat/*` branch, later cherry-picked (framework commit only) onto a branch
based on `upstream/main` for the real PR to `cs-util-com/location-based-webxr`.

Goal here: do the same for the byte-source/transport half of cloud-loader.
**No behavior change** — pure move + thin re-wire, so no new tests, existing
tests move and keep passing unchanged (aside from import paths).

---

## What moves vs what stays

Read against the current `components/cloud-loader/` tree, file by file:

| File | Generic? | Verdict |
|---|---|---|
| `core/byte-source.ts` (`ByteSource`, `SwitchableByteSource`) | yes — no tour concept | **move** |
| `core/content-range.ts` (`parseContentRangeTotal`) | yes — generic HTTP header parse | **move** |
| `core/fallback-decision.ts` (`ProbeResult`, `FallbackDecision`, `decideFallback`) | yes, *except* it imports `TourLoadCause` for the reject cause | **move, with cause type narrowed** (see below) |
| `view/remote-range-byte-source.ts` (`probeRemote`, `RemoteRangeByteSource`) | yes — generic HTTP Range transport | **move** |
| `view/local-cache-source.ts` (`LocalCacheByteSource`, `LocalCacheStore`, `InMemoryLocalCacheStore`, `CacheApiStore`) | yes — generic Cache-API-backed byte store | **move** |
| `view/byte-source-reader.ts` (`ByteSourceReader`) | yes — generic zip.js `Reader` adapter over any `ByteSource` | **move** |
| `core/share-link.ts` (`normalizeShareUrl`) | yes — Dropbox/GitHub/Drive/OneDrive share-link → raw-URL rewrite, no tour concept | **move** |
| `core/errors.ts` — `StructuralAssetError` | yes — generic "permanent per-item read failure" | **move** |
| `core/errors.ts` — `TourLoadError` / `TourLoadCause` | no — tour-specific error surfaced to the onboarding gate | **stays** |
| `core/mime-for-asset.ts` | no — keyed on `AssetType` from the store contract | **stays** |
| `core/asset-provider.ts` (`RefCountedAssetProvider`) | no — implements the store's `AssetProvider` | **stays** |
| `view/open-remote-tour.ts` | no — orchestrator; owns `tour.json` parsing, asset join, onboarding-facing errors | **stays, becomes thin adapter** |
| `view/fixture-server.ts`, `cloud-loader.integration.test.ts` | test scaffolding for the orchestrator | **stays** |

**The one real design decision:** `decideFallback`'s reject branch currently
returns a `TourLoadCause` (`"unusable-link" | "cors" | "corrupt" | "missing" |
"invalid-tour-json" | "asset-missing-in-zip"`). Only the first four are
producible by the probe itself; the last two are orchestrator-level (tour.json
parsing, asset join) and never come from `decideFallback`. Moving this function
to the framework means it cannot depend on TourBuilder's `TourLoadCause`.

- **Decision E1:** introduce a framework-owned `RangeProbeRejectCause = "unusable-link"
  | "cors" | "corrupt" | "missing"` in the moved `fallback-decision.ts`. TourBuilder's
  `TourLoadCause` becomes `RangeProbeRejectCause | "invalid-tour-json" |
  "asset-missing-in-zip"` (a superset), imported from the framework. No behavior
  change — same four literal strings, just declared where they're produced.

---

## Target framework layout

Added to `GpsPlusSlamJs_AppFramework/src/storage/` (flat, matching the existing
convention there — no subfolder; per-file `*.ts.md` sidecar, not a directory
README, since this is framework code not TourBuilder):

```
storage/
  byte-source.ts            byte-source.ts.md            # ByteSource, SwitchableByteSource
  range-probe.ts             range-probe.ts.md            # ProbeResult, RangeProbeRejectCause,
                                                            # FallbackDecision, decideFallback,
                                                            # parseContentRangeTotal (content-range.ts folded in — one header-parse helper doesn't earn its own file at framework granularity)
  remote-range-byte-source.ts  remote-range-byte-source.ts.md   # probeRemote, RemoteRangeByteSource
  local-cache-byte-source.ts   local-cache-byte-source.ts.md    # LocalCacheByteSource, LocalCacheStore,
                                                                  # InMemoryLocalCacheStore, CacheApiStore
  zip-byte-source-reader.ts    zip-byte-source-reader.ts.md     # ByteSourceReader (zip.js Reader adapter)
  share-link.ts                 share-link.ts.md             # normalizeShareUrl
  structural-read-error.ts      structural-read-error.ts.md  # StructuralAssetError → renamed StructuralReadError
                                                                # (name was tour-flavored; behavior/shape unchanged)
```

Exported from `storage/index.ts` alongside the existing zip exports.

**Naming note (E2):** `StructuralAssetError` is renamed `StructuralReadError`
in the framework (it has nothing to do with "assets" once generic — it is
"this range/entry read failed permanently, do not retry"). TourBuilder's
`asset-provider.ts` catches/rethrows it under its existing local vocabulary
where needed, so nothing downstream of the provider notices the rename.

---

## TourBuilder side after the move

`components/cloud-loader/` shrinks to the tour-aware layer only:

```
core/
  errors.ts          # TourLoadError only; TourLoadCause extends the framework's
                      # RangeProbeRejectCause with the two tour-specific causes
  mime-for-asset.ts
  asset-provider.ts  # imports StructuralReadError from the framework
view/
  open-remote-tour.ts   # imports ByteSource/SwitchableByteSource, decideFallback,
                         # RemoteRangeByteSource/probeRemote, LocalCache*,
                         # ByteSourceReader, normalizeShareUrl from the framework;
                         # keeps: tour.json read+validate, asset join, warm-cache
                         # orchestration, TourLoadError mapping
  fixture-server.ts
  cloud-loader.integration.test.ts
```

Deleted: `core/byte-source.ts(.test)`, `core/content-range.ts(.test)`,
`core/fallback-decision.ts(.test)`, `core/share-link.ts(.test)`,
`view/remote-range-byte-source.ts(.test)`, `view/local-cache-source.ts`,
`view/byte-source-reader.ts`. Their `.test.ts` files move to the framework
**unchanged apart from import paths** — same assertions, same fakes.

`RECIPE.md` and `demo.ts`/`index.html` are untouched (they consume
`openRemoteTour`, which keeps its public signature).

---

## Verification

Same battery as the prior two extractions — no new tests, only moved ones:

1. `cd GpsPlusSlamJs_AppFramework && pnpm test` — moved unit tests pass under
   their new paths (byte-source capture/idempotent-switch, fallback-decision
   206/200/416/404/no-size branches, remote-range-byte-source against a fake
   `fetch`, local-cache-source Cache-API/in-memory stores, share-link per
   provider).
2. `cd GpsPlusSlamJs_TourBuilder && pnpm test` — full gate (format, lint,
   jscpd, cycles, boundaries, deadcode, typecheck, unit) green with
   `open-remote-tour.ts` now importing from the framework; the integration
   suite (`cloud-loader.integration.test.ts`, fixture server) proves the
   thin adapter still behaves identically end to end.
3. Manual: `pnpm run dev` in TourBuilder → `/components/cloud-loader/` → rerun
   the four demo beats from the original plan (instant start, 206 range read,
   warm→local switch, `/no-ranges` fallback) to confirm no runtime regression
   the test suite wouldn't catch (real Cache API / real CORS, per C19 of the
   original plan).

---

## Deliverable ordering

Each step is a single commit, tests-first is moot here (tests are moved, not
new) — the moved test must still pass immediately after its file lands:

1. `feat(framework): add byte-source + range-probe transport (from cloud-loader)`
   — `byte-source.ts`, `range-probe.ts`, `remote-range-byte-source.ts`,
   `local-cache-byte-source.ts`, `zip-byte-source-reader.ts`, `share-link.ts`,
   `structural-read-error.ts`, their moved tests, sidecars, `storage/index.ts`
   exports.
2. `refactor(tourbuilder): rewire cloud-loader onto the framework's byte-source`
   — delete the moved TourBuilder files, update `open-remote-tour.ts` /
   `asset-provider.ts` / `errors.ts` imports, `TourLoadCause` narrows to the
   two tour-specific causes + the framework's `RangeProbeRejectCause`.

Both commits land on `feat/cloud-loader-range-source` (branched off `main`),
mirroring `feat/packaging-zip-qr`/`pr/packaging`. Once green, this fork's PR
flow: open a PR into this fork's `main` (like `pr/packaging` → PR #7); once
merged there, cherry-pick commit 1 only onto a branch based on `upstream/main`
and open the real PR to `cs-util-com/location-based-webxr` per `CONTRIBUTING.md`
(fork already configured — `upstream` remote exists).
