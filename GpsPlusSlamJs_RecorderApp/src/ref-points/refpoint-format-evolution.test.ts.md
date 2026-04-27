# refpoint-format-evolution.test.ts

## Purpose

Audit-style vitest suite that reads two real recording zips from
`TestDataJs/` (one pre-raw-storage, one current) and asserts which fields
the `markReferencePoint` action payload carries in each era. Used to answer
the investigation question documented in
[../../../GpsPlusSlamJs_Docs/docs/2026-04-24-refpoint-positioning-investigation.md](../../../GpsPlusSlamJs_Docs/docs/2026-04-24-refpoint-positioning-investigation.md):

> Can prior ref points from any past recording be visualized in 3D with
> the same mechanism the current code uses (raw GPS lat/lon →
> `calcRelativeCoordsInMeters`)?

## Public API

None — this is a test file only.

## Invariants & assumptions

- Reads `TestDataJs/2026-03-05_06-47-31utc.zip` (old) and
  `TestDataJs/2026-04-23_15-55-36utc.zip` (new). If either is missing,
  every test is a no-op (CI-friendly skip).
- Uses `gps-plus-slam-app-framework/storage/zip-reader` for zip parsing
  and `../storage/recording-migration` to bring old payloads forward to
  the current shape.
- Does not validate GPS _values_ beyond "plausible, non-zero coordinates".
  Exact lat/lon depends on where the recording was made.

## Examples

Run just this test:

```powershell
cd GpsPlusSlamJs_RecorderApp
pnpm run test:unit -- src/ref-points/refpoint-format-evolution.test.ts
```

## Tests (what each section proves)

| Section                           | Claim locked in                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Recording contents                | Both zips contain ≥ 1 `markReferencePoint` action.                                     |
| `odomCoordVersion`                | Old is `≤ 3` / absent, new is `≥ 4`.                                                   |
| Raw payload shape (pre-migration) | Old has `gpsPoint` with derived fields; new has `rawGpsPoint` with sensor-only fields. |
| Post-migration payload shape      | After `migrateActionsIfNeeded` both eras expose `rawGpsPoint` with identical keys.     |
| Lat/Lon fidelity                  | Every ref point carries real sensor lat/lon — **not** an H3 cell center.               |
| fusedGpsPoint is not stored       | Action payloads never embed fused GPS (it only lives in scenario-level JSON).          |
| Ref point ID shape                | New recordings use H3 resolution-11 hex indices.                                       |
| Positioning-in-3D contract        | `lat, lon` are always available → visualizer never needs an H3-center fallback.        |
