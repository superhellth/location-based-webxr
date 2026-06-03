# main.ts

## Purpose

Entry script for the minimal **GPS + AR hit-test** example. Glue only — a
structural port of the stock three.js `webxr_ar_hittest` example
(button → AR session → hit-test reticle → tap-to-place) adapted for the
GPS-aligned framework.

Intentionally does **not** depend on any recorder-only slices
(routing, scenarios, ref-points). It demonstrates the smallest end-to-end AR
integration over `createEnableGpsArController` + `registerXrFrameUpdate`.

## Behavior

- Boots `createSlamAppStore({ storageBackend: new NullStorageBackend() })`
  (the store backs the status panel's recording counters; the smoke test in
  [boot.test.ts](boot.test.ts) covers that it resolves and boots).
- Creates an "Enable GPS AR" controller and renders the app's **own** button
  over its observable state via the pure `buttonView()` mapping
  (checking → unsupported/ready → starting → running/error).
- On click, calls `controller.enable({ container, requestHitTest: true,
  onGpsPosition })` inside the user gesture so permission prompts are allowed.
- Once `running`, installs the hit-test reticle: requests a `viewer`-space
  hit-test source once, then each XR frame reads
  `frame.getHitTestResults(source)` and drives the reticle via
  [reticle.ts](reticle.ts).
- Wires the AR `select` (tap) through the GPS gate in [placement.ts](placement.ts):
  before the first GPS fix a tap flashes a transient "waiting for GPS…" hint;
  after a fix it places the root cube under the GPS-aligned scene root at the
  reticle's world position (the _intentional_ floater).

## Invariants & assumptions

- The DOM ships three known IDs: `#status` (pre), `#enter-ar` (button) and
  `#ar-root` (the AR container passed to `initAR`). Missing any throws at
  startup so misconfiguration is loud.
- **Delta #1 — app-rendered button.** The framework owns the permission /
  enter-AR *sequence* (the controller), not the button DOM. The app styles and
  labels its own `<button>`.
- **Delta #2 — parenting.** The reticle (and any placed content) is added under
  `getArWorldGroup()` (AR-local space), **not** the GPS-aligned scene root
  (`getScene()`). This is the single line a porting developer is most likely to
  get wrong (Finding 2 in the plan doc).
- The `XrFrameContext` handed to the registered update is valid **only
  synchronously** inside the callback — the example never stashes `frame` /
  `session` for later use.

## Tests

This module is WebXR glue and is verified manually via `pnpm dev` on an
AR-capable device. The pure pieces it depends on are unit-tested:
the reticle view-model in [reticle.test.ts](reticle.test.ts) and the status
formatter in [status.test.ts](status.test.ts). The store boot is covered by
[boot.test.ts](boot.test.ts).
