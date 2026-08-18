# gps-plus-slam-tour-builder

The lab package: the AR audio tour-guide prototype (`TASK.md`), built **one
isolated component at a time**. Every component is a folder under
`src/components/` with its own runnable demo page, its own pure unit-tested core,
and no dependency on any sibling component. Composition into the two app modes
(Authoring / Viewing) is the last step, not the first.

The single contract all components code against is `src/store/` — the `tour.json`
schema types plus the Redux slices, pinned in `plans/Shared-Contract.md`
(decisions D1–D17). Read that before touching tour/store code.

## Quick start

Run everything from this package directory (`GpsPlusSlamJs_TourBuilder/`).

```bash
pnpm install        # from the repo root, once
pnpm dev            # builds the framework, then Vite on http://localhost:8185
```

`http://localhost:8185/` is a gallery linking to all ten component demos; each
one also runs standalone at its own path (see the table below). No phone
needed — the movement-dependent demos replay a real recorded outdoor walk.

```bash
pnpm test           # the full gate — run this before pushing
pnpm run test:unit  # fast vitest loop (unit + replay e2e)
pnpm run test:watch
```

`pnpm test` = format → lint → lint:css → `check:all` → typecheck (app + tests) →
unit. `check:all` is jscpd (duplication), dpdm (circular deps),
dependency-cruiser (module boundaries) and knip (dead code).

Run a single file or test name:

```bash
pnpm exec vitest run src/components/proximity/core/proximity-machine.test.ts
pnpm exec vitest run -t "hysteresis"
```

Two demos need generated fixtures first (throwaway placeholder assets, not
checked in):

```bash
node scripts/make-fixtures.mjs            # component 1 — marker-*.png, clip-*.wav
node scripts/make-ar-scene-fixtures.mjs   # component 8 — public/ar-scene/*
```

TourBuilder is deliberately **not** wired into the repo-root aggregate
`pnpm test` or `build:site`; run its gate from here.

## Components

Each row is independently runnable: `pnpm dev`, then the listed path.
Components 1–6 are the Goal-1 building blocks; 7–10 are the viewing/authoring
surfaces that compose them.

| #   | Component                                                                         | Demo path                        | What it is                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [Clickable billboard](src/components/billboard/README.md)                         | `/src/components/billboard/`     | Yaw-to-face sprite + spatialized audio + in-world transport panel (play/stop, seekable bar). Seed of the AR knight markers.                                                          |
| 2   | [In-world text](src/components/in-world-text/README.md)                           | `/src/components/in-world-text/` | Billboarded paginated text panel; HTML-in-3D backend with automatic `CanvasTexture` fallback (XR-safe).                                                                              |
| 3   | [Tour data model + store](src/store/README.md)                                    | `/src/components/store/`         | The §2.2 contract: schema types, `validateTour`, slices, selectors, the two store factories.                                                                                         |
| 4   | [Proximity & zone machine](src/components/proximity/core/proximity-machine.ts.md) | `/src/components/proximity/`     | `IDLE → PREFETCHING → ACTIVE` per waypoint with hysteresis, pure world-space (X/Z), no GPS/geo math. Replay-tested.                                                                  |
| 5   | [Packaging & QR](src/components/packaging/README.md)                              | `/src/components/packaging/`     | Bundles a `Tour` + asset files into an **uncompressed** `tour.zip`; turns the hosted URL into a scannable viewing link.                                                              |
| 6   | [Cloud-storage tour source](src/components/cloud-loader/README.md)                | `/src/components/cloud-loader/`  | `?tour=<zipUrl>` → running tour: byte-range reads of the hosted ZIP, `AssetProvider` by id, local warm copy, no-range fallback.                                                      |
| 7   | [2D map overview](src/components/map/README.md)                                   | `/src/components/map/`           | Toggleable real-time Leaflet map (plain DOM, no Three.js): visitor dot + waypoint markers recoloured by the real proximity driver.                                                   |
| 8   | [AR viewing scene](src/components/ar-scene/README.md)                             | `/src/components/ar-scene/`      | The Three.js side of viewing mode: geo→world anchoring, knights that prefetch at 25 m and appear at 10 m, tap-to-play stories with a floating transcript, recycled breadcrumb trail. |
| 9   | [Onboarding gate](src/components/onboarding/README.md)                            | `/src/components/onboarding/`    | Camera/GPS permission checklist gating a Start button; the Start click doubles as the gesture that unlocks the Web Audio API.                                                        |
| 10  | [Authoring tools](src/components/authoring/README.md)                             | `/src/components/authoring/`     | Drop waypoints at the live (or replayed) GPS position, attach model/sprite/audio files, record the breadcrumb trail, export a real `tour.zip` via component 5.                       |

Supporting directories (not runnable components):

- `src/components/shared/` — cross-component pure helpers (`billboard-math`,
  `canvas-panel`, `panel-geometry`, `tap-gate`, `pointer-tap-picker`,
  `playback-loop`, `resize`, `clamp`, demo CSS). Defined once so the
  duplication gate stays green; a component may import these, never another
  component's internals.
- `src/store/` — lives at the `src/` root, not under `src/components/`. Dependencies
  flow **components → store** only (enforced by
  `config/.dependency-cruiser.cjs`).
- `scripts/` — fixture generators (`make-fixtures.mjs`,
  `make-ar-scene-fixtures.mjs`) and demo-track extractors that turn a
  `recordings/*.zip` walk into the `demo-track.json` used by the map and
  authoring demos.
- `public/` — generated throwaway fixtures. A real tour ships GLB/MP3/OGG.

## Package layout

All source lives under `src/` (matching every other package in the repo); only
config, `scripts/`, `public/` and the gallery `index.html` sit at the package
root.

```
src/
  components/<name>/   one folder per component (see below)
  store/               the shared §2.2 contract — the `src/` root, not a component
```

Because each component's demo page lives next to its code, the dev URLs carry
the `src/` prefix too: `http://localhost:8185/src/components/billboard/`.

## Structure of a component

```
src/components/<name>/
  core/        pure, framework-free logic + unit tests — never imports Three.js or DOM
  view/        Three.js / DOM layer (raycasting, CanvasTexture, audio, fetch) + replay e2e
  demo.ts      the standalone demo for this one component
  index.html   its page (also registered in vite.config.ts `build.rollupOptions.input`)
  README.md    directory sidecar (see docs convention below)
```

The `core` / `view` split is the purity seam the "components first" rule
demands: everything worth unit-testing (math, reducers, hit-mapping, wrapping,
validation, zip layout) sits in `core` and runs headless.

Component 8 adds a third layer between the two: `runtime/` holds the stateful
orchestrator (presenters, lifecycle, dispose ordering, driver wiring) and is
still **THREE-free and DOM-free** — dependency-cruiser enforces that boundary.

## Two test levels

1. **Unit tests** for all pure logic, colocated in `core/` (and `src/store/`).
2. **Replay e2e** on top, for anything with a movement dependency: real outdoor
   recordings from `recordings/` are fed through `replayRecording` so the
   component runs deterministically on a desktop with no phone. Today:
   - `src/components/proximity/view/proximity-replay.e2e.test.ts`
   - `src/components/map/view/tour-map-replay.e2e.test.ts`
   - `src/components/ar-scene/runtime/tour-scene-replay.e2e.test.ts`
   - `src/components/authoring/view/authoring-session-replay.e2e.test.ts`

   Component 6 additionally has a network integration test against a local
   fixture server.

Both levels run under plain `vitest` (`vitest.config.ts` collects
`src/**/*.test.ts`) — there is no Playwright in
this package.

## Adding a component

1. Write a dated plan in `plans/` (`YYYY-MM-DD-<name>-plan.md`) and iterate it
   before coding.
2. Create `src/components/<name>/{core,view}/`, `demo.ts`, `index.html`, `README.md`.
3. Register the page in `vite.config.ts` (`build.rollupOptions.input`) and link
   it from the root `index.html` gallery.
4. Tests first; keep `core` free of Three.js and DOM.
5. Green `pnpm test` before pushing.

## Docs convention

TourBuilder deliberately **does not** use the repo's per-file `*.md` sidecars.
It uses **one README per directory**.
In short:

- The directory is the meaningful unit here: `core/` vs `view/` is the purity
  seam, and the invariants worth recording (one-way data flow, who owns which
  policy) span the modules in a directory rather than sitting in one file.
- Modules are small (often < 100 lines) and carry rich module-level doc
  comments; a per-file sidecar would largely duplicate that header.
- One README per directory keeps cross-module contracts (e.g. reducer ⇄
  reconcile ⇄ view command execution) in one place instead of split across N
  sidecars.

Consequences for contributors: per-file doc comments at the top of each module
remain mandatory, and the directory README must be updated whenever a module's
behavior changes — the same rule sidecars have elsewhere.
Other packages keep per-file sidecars; extracting a TourBuilder module upstream
means adding a sidecar at that point. Reviews should not re-flag the absent
per-file sidecars as convention drift.
