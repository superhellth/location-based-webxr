# 2026-08-07 — Component 10 demo: UX pass (implementation plan)

## Context

The functional implementation of component 10 (authoring tools,
`plans/2026-08-07-authoring-plan.md`) is done and green — 43 unit/replay
tests, real end-to-end verification in browser. But the demo itself
(`components/authoring/index.html` + `demo.ts`) is a raw pile of unlabeled
inputs and buttons: two blank text boxes for tour name/description, a
waypoint row cramming an id, two bare number inputs, and three unlabeled
file pickers into one line, tiny buttons at the bottom, one shared status
line. A screenshot review confirmed it's genuinely hard to use, not just
unpolished.

**Scope: the standalone demo page only** (`components/authoring/`) —
confirmed with the user. The eventual composed Authoring app UI is a later
Goal-2 step and out of scope here.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| U1 | **Four labeled sections**: Position, Tour Details, Waypoints, Export. | Currently one undifferentiated block; sections give the page a legible shape without inventing a new visual language — same dark-card style already used by the onboarding/packaging demos. |
| U2 | **Compose in component 7's map (read-only), with explicit attribution.** | User's explicit call: see live position + waypoint markers spatially. The attribution line ("Map view — from Component 7, visualization only") keeps the component boundary honest — comp10 doesn't own map logic, it borrows an already-approved component's view for illustration, matching TASK.md's "components stay independently demoable" spirit. |
| U3 | **Reuse `computeMarkerViewModels`** (component 7's own pure helper) for the marker list, with `visitedIds: []` and `nextId: null` — authoring has no visited/next concept, every dropped waypoint is a plain marker. | No new marker-status logic invented; every waypoint shows `unvisited` styling, which is the correct semantic (nothing is "visited" during authoring). |
| U4 | **Waypoint cards, not table rows.** Numbered heading ("Waypoint 1") with the real id (`wp-1`) as a small secondary badge; labeled radius fields with units; one labeled row per asset slot. | The id-first layout (`wp-1` next to a bare "25") is what made the screenshot unreadable — leads with the number a human cares about, keeps the stable id visible but secondary. |
| U5 | **Show attached-asset filename as explicit text from `waypoint.content`, not the native file input's label.** | Real bug fix, not just polish: `mountAuthoringView` rebuilds every file `<input>` from scratch on each re-render (any store change — e.g. dropping a second waypoint), which silently resets the browser's native "chosen file" label to empty even though the asset is still attached underneath. Reading the attached filename from state instead of trusting native input UI state is the actual fix. |
| U6 | **Empty state for the waypoint list** ("No waypoints yet — drop one to get started") instead of a blank area when `waypoints.length === 0`. | Currently indistinguishable from "broken" — nothing renders. |
| U7 | **Export status gets real ok/error styling** (the `data-state` attribute already exists, just has no CSS). | Currently plain, easy-to-miss text; the semantic hook is already there from the original implementation. |
| U8 | **No new dependency direction violation**: `components/authoring/demo.ts` imports `components/map/view/tour-map.ts` and `components/map/core/map-marker-state.ts` directly — a demo-to-demo-view import, same shape as `ar-scene`'s demo already composing components 1/2/3/4/6. Not a `core/` import (core stays framework/DOM-free). | Confirm this is an accepted pattern before implementing — `dependency-cruiser` allows `components → components` for `view`/`demo.ts`, only `core` has stricter isolation; verify at implementation time. |

---

## Layout (ASCII sketch — replaces the current single blob)

```
┌─ Component 10 — Authoring tools demo ─────────────────────────────┐
│ (intro paragraph, unchanged)                                       │
└──────────────────────────────────────────────────────────────────┘

┌─ Position ─────────────────────────────────────────────────────────┐
│ ( ) Live GPS   (•) Replay Task 1 walk     [Pause]  [====●=====]     │
│ Replaying: sample 15/197 — 50.778242, 6.088990                     │
│ ┌─────────────────────────────────────────┐                        │
│ │           <leaflet map>                  │  Map view — from      │
│ │                                           │  Component 7,         │
│ │                                           │  visualization only   │
│ └─────────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘

┌─ Tour Details ─────────────────────────────────────────────────────┐
│ Name         [________________________]                            │
│ Description  [________________________]                            │
└──────────────────────────────────────────────────────────────────┘

┌─ Waypoints ────────────────────────────────────────────────────────┐
│ [ + Drop Waypoint ]  (primary button, disabled until a fix arrives) │
│                                                                      │
│ ┌─ Waypoint 1  wp-1 ──────────────────────────────── [Remove] ──┐   │
│ │ Prefetch radius  [25] m      Active radius  [10] m             │  │
│ │ Model (.glb/.gltf)   [Choose file]   knight.glb ✓ attached     │  │
│ │ Sprite (image)       [Choose file]   (none)                    │  │
│ │ Audio (.mp3/.ogg)    [Choose file]   (none)                    │  │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ (empty state when no waypoints: "No waypoints yet — drop one to    │
│  get started")                                                     │
└──────────────────────────────────────────────────────────────────┘

┌─ Export ───────────────────────────────────────────────────────────┐
│ [ Export & Pack ]                                                   │
│ ✓ Packed tour.zip — 409 bytes, 1 waypoint(s).   (green on success)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### `authoring-view.ts` changes (component 10's own view layer)

- `renderWaypointRow` → `renderWaypointCard`: restructure to the card layout
  above. Each asset-slot row gets a `<label>` + the file `<input>` + a
  `<span data-testid="asset-status-<slot>-<id>">` reading
  `wp.content[slot]` → look up the matching `AssetEntry.filename` in
  `authoring.assets` (fall back to "(none)" when absent) — this is the U5
  bug fix, testable directly (render with a waypoint whose `content.model`
  is already set + a matching `assets` entry → assert the status span shows
  the filename, survives a re-render).
- Empty-state render branch when `waypoints.length === 0` (U6).
- Name/description inputs get real `<label>` elements (`for`/`id` pairs).
- No behavioral change to the dispatch/session wiring already tested —
  this is a render-shape change, covered by updating the existing
  `authoring-view.test.ts` assertions (still `data-testid`-driven, just
  restructured DOM) plus the new U5/U6 cases.

### `demo.ts` + `index.html` changes (demo-only, U2/U3/U8)

- `index.html`: four `<section>` blocks (Position/Tour Details/Waypoints/
  Export) replacing the current flat layout; a `<div id="map-host">` inside
  Position with the attribution line beside it; CSS for waypoint cards,
  empty state, and `[data-state="ok"]`/`[data-state="error"]` status
  colors (green/red — same palette already used by `packaging`'s demo
  status lines).
- `demo.ts`: construct `createTourMap(mapHost)` (component 7) once at
  startup; on every position tick (`onSeek` for replay, the live
  `PositionSource` callback for live GPS) call `map.setGpsPosition(lat,
  lon)`; on every store change (the same `subscribe` callback driving
  `mountAuthoringView`) call
  `map.setWaypoints(computeMarkerViewModels(authoring.waypoints, [], null))`
  (U3). The map is read-only — no click-to-drop-waypoint wiring; dropping
  stays the existing "Drop Waypoint" button flow (out of scope to change
  the interaction model, only the visualization).
- Verify `dependency-cruiser` accepts the new `components/authoring →
  components/map` edge before writing code (U8) — if it's blocked, the
  fallback is importing only the pure `core/map-marker-state.ts` +
  `view/tour-map.ts` (already the plan) rather than anything from `map`'s
  own `demo.ts`.

### Tests

- `authoring-view.test.ts`: update existing DOM-shape assertions to the new
  card structure (labels, `data-testid` conventions stay stable where
  reasonable so most assertions carry over); add the U5 case (attached
  filename survives a re-render triggered by an unrelated state change)
  and the U6 case (empty-state text renders when `waypoints` is empty, and
  is replaced once a waypoint exists).
- No new unit tests needed for `demo.ts` itself (matches existing
  convention — demos are manually/browser-verified, not unit-tested, same
  as every other component's `demo.ts` in this package).

---

## Verification

Manual, in-browser (same as the original comp10 demo verification):
attach a file to a waypoint, drop a second waypoint, confirm the first
waypoint's attached-filename text is still shown (proves U5); confirm the
map shows a marker where each waypoint was dropped and the position dot
tracks replay/live GPS; confirm the empty state shows before any waypoint
exists and disappears after the first drop; export and confirm the status
line is visibly green.

---

## Next steps

1. Implement `authoring-view.ts` changes first (TDD — the U5/U6 behavior is
   real logic worth pinning in tests), then the demo/HTML/CSS changes
   (verified manually in-browser, matching the rest of the package's
   convention).
2. Update `components/authoring/README.md` / `view/README.md` if the
   card-layout or map-composition changes anything the sidecar docs claim
   (mandatory per the per-directory-README convention on any behavior
   change).
3. Run the full package gate (`pnpm test`) before considering this done.
