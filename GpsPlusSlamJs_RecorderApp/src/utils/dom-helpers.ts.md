# dom-helpers.ts

## Purpose

Shared DOM element lookup utilities used by UI modules. Provides fail-fast behavior for critical UI element queries.

## Public API

### `getRequiredElement<T>(id, context?)`

Look up a DOM element by ID, throwing if not found.

```typescript
import { getRequiredElement } from '../utils/dom-helpers';

const btn = getRequiredElement<HTMLButtonElement>('btn-start');
const panel = getRequiredElement('summary-panel', 'session-summary markup');
```

- **`id`**: Element ID to query via `document.getElementById`
- **`context`** (optional): Hint included in the error message (e.g. `"session-summary-panel markup"`)
- **Returns**: The element cast to `T`
- **Throws**: `Error` if element is not found

## Invariants

- Always throws synchronously — no silent `null` returns.
- Error messages include the element ID and optional context for easy debugging.

## Tests

Covered by `dom-helpers.test.ts` (6 tests) — element lookup, generic typing, error messages with/without context.
