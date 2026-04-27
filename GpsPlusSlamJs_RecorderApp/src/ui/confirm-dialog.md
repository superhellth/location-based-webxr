# Confirm Dialog Component

**Purpose:** A styled HTML confirmation dialog that replaces native `confirm()` for use inside WebXR DOM overlays where native dialogs are unreliable on mobile browsers. Returns a `Promise<boolean>`: `true` for confirm, `false` for cancel/dismiss.

## Public API

### Types

| Type                   | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `ConfirmDialogOptions` | `{ message, confirmLabel?, cancelLabel? }` — dialog configuration. |

### Functions

| Function                 | Signature                                             | Description                                                 |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| `showConfirmDialog`      | `(options: ConfirmDialogOptions) => Promise<boolean>` | Show a styled confirm dialog. Resolves `true`/`false`.      |
| `isConfirmDialogVisible` | `() => boolean`                                       | Whether a confirm dialog is currently visible.              |
| `destroyConfirmDialog`   | `() => void`                                          | Remove dialog and resolve any pending promise with `false`. |

## Invariants & Assumptions

- **Promise-based:** Always resolves (never rejects). `true` = confirm, `false` = cancel/dismiss/destroy.
- **Self-replacing:** If a new dialog is requested while one is showing, the previous promise is resolved with `false` and the old dialog is removed before the new one is created.
- **DOM cleanup:** Dialog and backdrop are both removed from the DOM after any resolution (confirm, cancel, destroy).
- **Backdrop is a body sibling:** The backdrop is appended directly to `document.body` (not inside the dialog) so its `100%` width/height resolves against the viewport, covering the full screen.
- **High z-index:** Dialog renders with Tailwind class `z-[1001]` (backdrop `z-[1000]`) to appear above WebXR DOM overlay content.
- **Tailwind utility classes:** All styling uses Tailwind utility classes via `className`, consistent with the rest of the Recorder App UI (hud.ts, session-summary.ts, summary-map.ts). No inline `Object.assign(el.style, {...})` calls.
- **No native APIs:** Does not use `window.confirm()` — uses pure DOM elements to avoid WebXR/mobile incompatibilities.
- **Default labels:** `confirmLabel` defaults to `'Confirm'`, `cancelLabel` defaults to `'Cancel'`.

## Example Usage

```typescript
import { showConfirmDialog, isConfirmDialogVisible } from './confirm-dialog';

// Show dialog and await user choice
const confirmed = await showConfirmDialog({
  message: 'Stop recording and go back?',
  confirmLabel: 'Stop recording',
  cancelLabel: 'Keep recording',
});

if (confirmed) {
  // User chose to stop
  await handleStopRecording();
} else {
  // User cancelled — re-push history state
  pushScreenState('recording');
}
```

## Tests

- **Unit tests** in `confirm-dialog.test.ts` (21 tests): dialog creation, message display, custom/default labels, visibility flag, confirm resolves `true`, cancel resolves `false`, DOM cleanup, backdrop as body child, backdrop cleanup after confirm/cancel, self-replacing behavior, z-index class, backdrop, destroy cleanup, Tailwind class assertions for dialog/backdrop/buttons.
- **Property-based tests** in `confirm-dialog.property.test.ts` (5 tests): arbitrary messages display without error, confirm always returns `true`, cancel always returns `false`, DOM always cleaned up, destroy always resolves `false`.

## Related Files

- [navigation.ts](./navigation.ts) — `onBackDuringRecording` callback triggers this dialog
- [main.ts](../main.ts) — `handleBackDuringRecording` orchestrates the dialog → stop recording flow
