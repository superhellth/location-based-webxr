# ref-point-subscribers.ts

## Purpose

Recorder-app wiring between the flat `selectRefPointEntries` selector
and the `RefPointVisualizer`. Step 5.3 of
`2026-05-27-collapse-refpoint-and-frame-slices-plan.md` migrated this
subscriber from the library's `selectReferencePoints` (over
`state.gpsData.referencePoints`) onto the recorder-side slice
`state.refPoints.entries`, which is now the single source of truth
for ref points in the recorder.

## Public API

- `wireRefPointSubscribers(store, visualizer): () => void`
  - `store: RecorderStore` — recorder store.
  - `visualizer: Pick<RefPointVisualizer, 'syncRefPoints' | 'setZeroRef'> | null` —
    `null` is accepted (no-op) so headless / replay paths can opt out.
  - Returns an unsubscribe function that detaches the store listener.

## Invariants & assumptions

- Performs an initial `syncRefPoints` call on attach so existing entries
  render immediately (e.g. imported via the OPFS sidecar fast-path
  before the subscriber attached).
- Subsequent calls fire **iff** `selectRefPointEntries` returns a new
  array reference. The memoised selector returns the same reference when
  `state.refPoints` is unchanged, so unrelated state mutations don't
  trigger re-renders.
- The visualizer owns the id-based diff and decides which inserts to
  animate; this wirer just forwards the full selector result.
- **Zero reference (single source of truth — audit F2):** the store is the
  single source of truth for the GPS zero reference, which the visualizer
  uses for lat/lon → metres conversion. This wirer pushes the store zero into
  the visualizer via `setZeroRef` on attach (before the initial sync) and again
  whenever `selectZeroReference` returns a different value (a re-zero /
  QR-origin override). `setZeroRef` replays the visualizer's cached entries, so
  a zero-only change re-renders all ref points at the new origin without a
  separate `syncRefPoints` call. This replaces the old "set the origin once and
  ignore later changes" wiring that left the visualizer pinned to a stale
  origin. NOTE: the recorder currently sets the store zero exactly once per
  session, so this is a latent-bug guard — it becomes load-bearing the moment a
  re-zero path is added.

## Tests

- `ref-point-subscribers.test.ts` — initial sync on attach, sync on
  selector-result change, no-op when result reference is unchanged,
  null-visualizer no-op, and unsubscribe detaches. Zero-reference reactivity:
  pushes store zero on attach, skips when the store has none, re-pushes on a
  changed zero, and does not re-push when the zero is unchanged.

## Related docs

- `gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-27-collapse-refpoint-and-frame-slices-plan.md`
- `recorder-store.ts.md`
- `ref-points-slice.ts.md`
- `ref-point-visualizer.ts.md`
