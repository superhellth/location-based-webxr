# `ar-world-group-alignment.ts` — framework-default alignment for `arWorldGroup`

- **Purpose:** wire the store's alignment matrix to a smoothly-lerped
  `arWorldGroup.matrix` in a single call, so the AR view (camera + every GPS
  anchor under `arWorldGroup`) is GPS-registered without each app re-deriving the
  lerper + subscription + frame-loop plumbing by hand.

- **Public API:**
  - `enableArWorldGroupAlignment(options) → ArWorldGroupAlignmentHandle`
    - `options.store: SubscribableStore` — read via `selectAlignmentMatrix`.
    - `options.arWorldGroup: THREE.Object3D` — the node whose `.matrix` is lerped.
    - `options.lerpRate?: number` — forwarded to `createAlignmentLerper`
      (defaults to the lerper's own `DEFAULT_LERP_RATE`).
    - Returns a handle with `dispose()` that removes the store subscription, the
      per-frame update, and disposes the lerper.

- **Invariants & assumptions:**
  - The first alignment target is applied **instantly** (via the lerper's
    first-target rule) so the view never slides from identity; subsequent targets
    ease toward their value.
  - An alignment already present at enable time is adopted immediately
    (`selectAlignmentMatrix(store.getState())`), because `subscribeToSelector`
    only fires on change.
  - `null` alignment is ignored (no spurious identity target).
  - **Single-driver rule:** the helper owns its lerper and drives it from the
    frame loop. Do **not** call it for a group that already has an externally
    driven lerper (the recorder owns its own and must not be double-lerped).

- **Examples:**

  ```ts
  const handle = enableArWorldGroupAlignment({ store, arWorldGroup });
  // …per-frame, the framework frame loop now lerps arWorldGroup.matrix.
  handle.dispose(); // on teardown
  ```

- **Tests:** `ar-world-group-alignment.test.ts` covers: adopt-at-enable, null
  ignored, instant-first-then-ease convergence, and dispose-stops-updates. Driven
  with the real `frame-loop` (`runFrameUpdates`) + a minimal fake
  `SubscribableStore`.

- **Related:** `alignment-lerper.ts` (the smoothing primitive),
  `gps-anchor.ts` (anchors ride this alignment), and the plan at
  `gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-05-gps-anchor-frame-architecture-bug-and-plan.md`
  (Slice 2 / Bug A).
