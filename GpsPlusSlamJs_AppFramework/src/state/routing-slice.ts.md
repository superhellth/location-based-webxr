# routing-slice.ts

## Purpose

Redux slice for tracking the current application screen. Fixes Bug 2
(SPA architecture audit) by moving `currentScreen` from a module-level
variable in `navigation.ts` into the Redux store, making it the single
source of truth and enabling time-travel debugging.

## Public API

| Export               | Type           | Description                                   |
| -------------------- | -------------- | --------------------------------------------- |
| `AppScreen`          | Type           | `'setup' \| 'ar' \| 'recording' \| 'summary'` |
| `RoutingState`       | Interface      | `{ currentScreen: AppScreen }`                |
| `navigateTo(screen)` | Action creator | Dispatches screen change                      |
| `routingReducer`     | Reducer        | Pure reducer for `routing` slice              |

## State Shape

```typescript
{
  currentScreen: 'setup';
} // initial
```

## Invariants

- Initial state is always `{ currentScreen: 'setup' }`.
- `navigateTo` simply overwrites `currentScreen` — no history stack in
  Redux (browser history handles that).
- Routing actions (`routing/navigateTo`) are **not persisted** during
  recording — they are UI state, not session data.

## Examples

```typescript
import { routingReducer, navigateTo } from './routing-slice';

// Initial state
const state = routingReducer(undefined, { type: '@@INIT' });
// → { currentScreen: 'setup' }

// Navigate to AR
const next = routingReducer(state, navigateTo('ar'));
// → { currentScreen: 'ar' }
```

## Tests

- `routing-slice.test.ts` — 5 unit tests covering initial state, all
  screen values, successive navigations, and reset to setup.
- `store.test.ts` — 5 integration tests verifying routing in the
  combined store (getState, dispatch, subscriber notification,
  non-persistence during recording).

## Related

- [SPA architecture audit — Bug 2](../../../GpsPlusSlamJs_Docs/docs/2026-04-06-spa-architecture-audit.md)
- [SPA best practices §4 — State-Driven Routing](../../../GpsPlusSlamJs_Docs/docs_guides/spa-architecture-best-practices.md)
- [navigation.ts](../../../GpsPlusSlamJs_RecorderApp/src/ui/navigation.ts) — consumer of this slice
