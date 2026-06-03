# `main.ts` — application entry (glue)

- **Purpose:** The "framework wiring — don't touch" layer. Composes the tested
  seams into the persistent-anchor flow: capability gate → AR boot on a user
  gesture → GPS/orientation wiring → onboarding coaching → soft-gated
  placement (cache-miss) or seed-and-re-converge (cache-hit).
- **Public API:** none (side-effecting entry). Editable seam is
  `createAnchorMarker()` in [marker.ts](marker.ts), imported under the clearly
  marked `--- your content here ---` banner.
- **Test seam:** every framework call site (`initAR`, `getArWorldGroup`,
  `getCamera`, `startGpsWatch`, `startOrientationWatch`,
  `requestDeviceOrientationPermission`, `createGpsAnchor`, `selectTrackingQuality`,
  `checkWebXRSupport`, `checkGeolocationPermission`, `createAnchorMarker`) is
  resolved through `getSeams()` from [seams.ts](seams.ts.md) instead of being
  called directly. In production `getSeams()` returns the real imports; the
  DEV-only `window.__anchorStarterSeams` override lets the Tier 1 Playwright e2e
  suite drive the real placement → `?show=` → copy-link glue without WebXR. See
  the prod-inert guarantee in [seams.ts.md](seams.ts.md).
- **Key flow:**
  - `main()` probes `checkWebXRSupport` + `checkGeolocationPermission`; if not
    fully supported, shows `capabilityMessage` (E1) and disables Start.
  - `startAr()` (user gesture): `createSlamAppStore({ NullStorageBackend })` →
    `setTrackingStore` → `initAR` → `startSession` (so the GPS coordinator
    feeds alignment) → `createGpsPositionHandler` + `startGpsWatch` →
    `requestDeviceOrientationPermission` + `startOrientationWatch` →
    wire `placeButton` + `copyLinkButton` clicks →
    `readCachedAnchor()` → `dispatchSetup(BOOTED)`.
  - `placeAnchor()` (cache-miss): `PLACE_REQUESTED` (saving) →
    `spawnAnchor(gps, false)` + `writeShowParam([anchorSpecFromGps(gps)])`
    (encodes the anchor into the `?show=` URL via `history.replaceState`) →
    `PLACE_SUCCEEDED`, or `PLACE_FAILED` on error (revert + error line). On
    failure it also `dispose()`s + nulls any partially created `anchor`, so a
    retry can never accumulate overlapping markers / leaked frame-loop
    registrations.
    Note: this path is **synchronous** — `saving` → `saved` happen in one
    call stack, so the transient `Saving…` state is a view-model concern, not
    an observable painted frame.
  - `spawnAnchor()` builds `createGpsAnchor` with `getAlignmentMatrix` /
    `getGpsZeroRef` / `getCurrentGpsPoint` bound to the live store + last GPS.
    It adds the marker to the AR world group *before* `createGpsAnchor`; if
    creation throws it removes the marker again, and it wraps the returned
    `dispose()` so disposing the anchor also detaches its marker (the
    framework `dispose()` only unregisters the frame-loop tick — see
    [gps-anchor](../../GpsPlusSlamJs_AppFramework/src/visualization/gps-anchor.ts.md)).
    This makes `anchor.dispose()` a complete teardown for every caller
    (placement retry, `failStart` boot rollback, `beforeunload`).
- **Invariants & assumptions:**
  - Selectors are run via the `sel()` helper which casts the store state per
    selector (only the read slices exist at runtime — same pattern as the
    MinimalExample).
  - `createGpsAnchor` self-registers its frame update, so the anchor ticks on
    the AR render loop automatically.
  - `lastGps` always carries a finite altitude (defaults to `0`) so the anchor
    seed is a well-formed `LatLongAlt`.
- **Tests:** glue is verified manually via `pnpm dev` on an AR device. The
  decision logic it composes is unit-tested in the sibling modules
  ([setup-state-machine](setup-state-machine.ts.md),
  [url-anchor-state](url-anchor-state.ts.md),
  [guidance-view](guidance-view.ts.md), [placement-view](placement-view.ts.md),
  [capability](capability.ts.md), [marker](marker.ts.md)). The placement glue —
  including the failure cleanup that prevents leaked / overlapping markers — is
  covered end-to-end by the Tier 1 Playwright suite
  (`playwright-tests/placement-flow.spec.js`).
