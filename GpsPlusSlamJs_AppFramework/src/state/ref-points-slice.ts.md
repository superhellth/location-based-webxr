# ref-points-slice.ts

## Purpose

Redux slice managing reference point state that was previously stored as closure variables in `ref-point-handlers.ts`. Moving this into Redux enables store subscribers, DevTools inspection, and clean dependency boundaries for library extraction.

## Public API

### State Shape (`RefPointsState`)

| Field                  | Type                     | Description                                         |
| ---------------------- | ------------------------ | --------------------------------------------------- |
| `importedRefPoints`    | `ImportedRefPoint[]`     | Prior ref points loaded from previous session ZIPs  |
| `sessionRefPointUsage` | `Record<string, number>` | Times each ref point was marked (keyed by H3 index) |

### Actions

| Action                      | Payload              | Description                                    |
| --------------------------- | -------------------- | ---------------------------------------------- |
| `setImportedRefPoints`      | `ImportedRefPoint[]` | Replace the full set of imported ref points    |
| `incrementRefPointUsage`    | `string`             | Increment usage count for a ref point by H3 ID |
| `clearSessionRefPointUsage` | -                    | Reset session usage counts to `{}`             |
| `resetRefPointsState`       | -                    | Reset all ref-point state to initial values    |

### Selectors

| Selector                     | Input            | Output            | Description                                     |
| ---------------------------- | ---------------- | ----------------- | ----------------------------------------------- |
| `selectCachedKnownRefPoints` | `RefPointsState` | `KnownRefPoint[]` | Memoized derivation of H3-indexed known ref pts |

### Exports

| Export             | Type      | Description       |
| ------------------ | --------- | ----------------- |
| `refPointsReducer` | `Reducer` | The slice reducer |

## Invariants & Assumptions

- `sessionRefPointUsage` uses `Record<string, number>` (not `Map`) for Redux serializability
- `selectCachedKnownRefPoints` is memoized by reference equality of `importedRefPoints`
- H3 resolution 11 is used for GPS-to-H3 conversion (~25m edge length)
- The slice is integrated into the combined store via `refPoints/` action prefix routing

## Examples

```typescript
import {
  setImportedRefPoints,
  selectCachedKnownRefPoints,
} from './ref-points-slice';

// Dispatch
store.dispatch(
  setImportedRefPoints([
    { id: 'bench', lat: 49.0, lon: 8.0, sourceZipName: 'session1.zip' },
  ])
);

// Select
const known = selectCachedKnownRefPoints(store.getState().refPoints);
```

## Tests

- `ref-points-slice.test.ts` — 13 tests covering initial state, all actions, selector computation and memoization, and `displayName` fallback from `name` to `id`
