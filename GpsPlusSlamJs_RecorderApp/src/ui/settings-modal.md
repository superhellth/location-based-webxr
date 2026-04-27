# settings-modal.ts

## Purpose

UI module for the Recording Settings modal — configures depth sampling and image capture options, and displays the build version.

## Public API

| Export                   | Signature                                                        | Description                                                    |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `initSettingsModal`      | `(changeCallback?: (options: RecordingOptions) => void) => void` | One-time init. Wires DOM events, populates build version label |
| `showSettingsModal`      | `() => void`                                                     | Opens modal, loads current options into working copy           |
| `hideSettingsModal`      | `() => void`                                                     | Closes modal, discards unsaved changes                         |
| `isSettingsModalVisible` | `() => boolean`                                                  | Whether modal is currently visible                             |
| `getWorkingOptions`      | `() => RecordingOptions \| null`                                 | Testing only — returns cloned working copy or null             |

## Invariants & Assumptions

- Must be called **after** DOM is ready (elements exist in `index.html`).
- Working options are a **clone** — the original `localStorage` values are unchanged until Save.
- Build version label (`#build-version-label`) is populated once during `initSettingsModal()` using `getBuildInfo()`. Format: `{appVersion} ({commitHash})`.
- If `#settings-modal` element is missing, init warns and returns (graceful degradation).
- Save persists to `localStorage` via `saveRecordingOptions` and fires the change callback.
- Reset restores `DEFAULT_RECORDING_OPTIONS` into the working copy (not saved until Save).

## Examples

```typescript
import { initSettingsModal } from './ui/settings-modal';

initSettingsModal((newOptions) => {
  console.log('Options changed:', newOptions);
});
```

## Tests

- `settings-modal.test.ts` — 39 tests covering show/hide, form population, slider/checkbox interactions, save/reset, backdrop click, build version label display.
- Tests use production HTML loaded via `loadSettingsTestFixture()` from `html-fixtures.ts`.

## Related

- [2026-04-20-zip-debug-metadata-plan.md](../../../GpsPlusSlamJs_Docs/docs/2026-04-20-zip-debug-metadata-plan.md) — Step 6 (build version display)
- [build-info.ts](../utils/build-info.ts) / [build-info.md](../utils/build-info.md) — Source of build version data
