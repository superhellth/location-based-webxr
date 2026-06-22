# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is (and what we're building on it)

This is a **fork of [cs-util-com/location-based-webxr](https://github.com/cs-util-com/location-based-webxr)** — an open-source Three.js + GPS + WebXR sensor-fusion framework for outdoor browser AR. Upstream provides the framework + a recorder app; the closed-source alignment core (`gps-plus-slam-js`) comes from npm.

**Our work (`TASK.md`) is a university lab on top of this fork:** building a location-based AR audio tour-guide prototype. Read `TASK.md` fully before planning feature work — it is the source of truth for what we are building and how. The non-obvious constraints it imposes:

- **Components first, composition last.** Build each piece (billboard sprite, in-world text, tour-data/Redux contract, proximity zone state machine, packaging+QR, cloud-storage loader, 2D map, AR scene, onboarding gate, authoring tools) as an *isolated, individually testable* unit with its own tiny demo page **before** wiring them together into the two app modes (Authoring / Viewing). Do not start by building the whole app.
- **Agree the shared contract first.** The `tour.json` schema + the Redux store slices are the single contract every component talks to. Pin these down before splitting work. Assets are referenced at runtime **by id**, never by file path, and flow through a small asset-provider interface (`getAssetUrl(id) → Promise<url>`, `release(id)`) — the store never holds asset bytes.
- **Work in world space, not geo coordinates.** The framework already fuses GPS+IMU and anchors content as world-space `THREE.Vector3` positions in meters. Do **not** write haversine/equirectangular math in proximity or scene logic — distance is `userPos.distanceTo(obj.position)`. Lat/lon legitimately appears only in persisted `tour.json` and the single framework anchoring step.
- **Two test levels.** Unit-test all pure logic/math; on top, add **replay e2e tests** that feed real outdoor recordings (captured per Task 1, exported as ZIPs) so components run deterministically on a desktop with no phone. The proximity state machine and full composed flow especially must be proven via replay.
- **Plan-first workflow.** For each component write a dated plan markdown (`YYYY-MM-DD-<component>-plan.md`), iterate it with an LLM as critical reviewer, commit revisions, then build. Reusable, GPS-free pieces (notably the proximity/zone state machine and the map) are candidates for upstream PRs.

## Repository layout

pnpm workspace (`pnpm@10`, Node ≥20) of four publishable/example packages plus repo-level glue:

| Package | Role |
| --- | --- |
| `GpsPlusSlamJs_AppFramework/` | The reusable framework (npm: `gps-plus-slam-app-framework`). WebXR, Three.js, sensors, storage, replay, store factory. |
| `GpsPlusSlamJs_RecorderApp/` | Reference recorder app (Vite + Playwright). The richest example of composing the framework — mirror its patterns. |
| `GpsPlusSlamJs_AnchorStarter/` | "Meaningful minimal" example: place one GPS anchor, persist it in the URL (`?show=`). |
| `GpsPlusSlamJs_MinimalExample/` | Smallest framework consumer; the starting template. |

The framework subpath exports map to `src/<module>/`: `ar`, `state`, `sensors`, `storage`, `geo`, `visualization`, `utils`, `types`, `licensing`, `core`.

## Architecture

Three-layer stack, strict one-way dependencies (the framework never imports from consuming apps; the closed core never imports from the framework):

```
Your app / RecorderApp   → UI, screen flow, app-specific reducers
gps-plus-slam-app-framework (this repo) → WebXR · Three.js · sensors · storage · replay · store factory
gps-plus-slam-js (npm, closed-source)   → GPS↔AR alignment, outlier rejection, GPS math
```

Key seams to understand before extending (each source file has a colocated `*.md` sidecar — read it):

- **Composable store.** `createSlamAppStore({ extraReducers, extraMiddleware, storageBackend })` (`src/state/create-slam-app-store.ts`) is how an app composes its own slices onto the framework's. The recorder does this in `GpsPlusSlamJs_RecorderApp/src/state/recorder-store.ts` — the canonical example for the Goal-2 composition step. Both the 2D DOM UI and the Three.js scene subscribe to this store; business logic/state is separated from views.
- **Storage backends.** `StorageBackend` interface with `NullStorageBackend` (no persistence) and `OpfsStorageBackend` (durable OPFS recording). Swap per app.
- **ZIP record/replay.** Sessions export to self-contained ZIPs via `ZipExportContributor`s (`src/storage/zip-export.ts`); `ReplayEngine` + `replayRecording` (`src/state/`) replay them deterministically. This is the mechanism the replay e2e tests build on.
- **GPS anchoring.** `createGpsAnchor` (`src/visualization/gps-anchor.ts`) turns a lat/lon into a stable world-space anchor and is the only place geo→world conversion belongs.

## Commands

Run from repo root unless noted. Each package's `test` runs format + lint + typecheck + unit (+ e2e where applicable) — the full gate.

```bash
pnpm install                  # install workspace (corepack enable first if needed)

pnpm test                     # everything: repo-config + framework + recorder + starter + example
pnpm run test:framework       # framework only
pnpm run test:recorder:unit   # recorder unit only (fast iteration)
pnpm run test:recorder:e2e    # recorder Playwright e2e (builds framework first)
pnpm run test:starter
pnpm run test:example

pnpm run build:site           # build deployable dist-site/ (landing + /recorder/ + /starter/ + /minimal/)
pnpm run check:deadcode       # knip across workspace
```

Single test / focused iteration (run inside the package dir, e.g. `GpsPlusSlamJs_AppFramework/`):

```bash
pnpm run test:unit                                    # unit suite with coverage
pnpm run test:watch                                   # watch mode
pnpm exec vitest run --config config/vitest.config.ts src/state/replay-engine.test.ts   # one file
pnpm exec vitest run --config config/vitest.config.ts -t "hysteresis"                    # by test name
pnpm run typecheck && pnpm run lint                   # individual gates
```

Dev servers (per app dir): `pnpm run dev` (builds framework, then Vite). The recorder/starter need a WebXR-capable phone or Chrome DevTools WebXR emulation for full function.

## Conventions

- **TDD by default** (red → green → refactor), enforced culturally and by CI.
- **Sidecar docs are mandatory.** Every behavior-implementing file has a colocated `*.md` (Purpose / Public API / Invariants / Examples / Tests). Update it when you change behavior.
- **Quality guards block merge:** strict TypeScript (no unjustified `any`), Prettier, ESLint, no circular deps (`dpdm`/`check:cycles`), no dead code (`knip`), no duplication (`jscpd`), module boundaries (`dependency-cruiser`). Run the package's full `pnpm test` before pushing.
- **Conventional Commits** (`feat`/`fix`/`refactor`/`test`/`docs` with a scope, e.g. `feat(framework): …`). Commit per finished logical step, not per work-session; keep refactors in separate commits from behavior changes.
- **Upstream contribution etiquette** (see `CONTRIBUTING.md`): fork → feature branch from `main`, tests first, small focused PRs, sign the CLA on first PR, PRs are squash-merged. Follow the project's existing style even where it differs from your own.
