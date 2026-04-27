# log-panel.ts

## Purpose

Expandable Log Panel UI component that displays recent log entries in a scrollable overlay. Users tap the status area in the HUD to toggle visibility. This addresses User Feedback Issue #5: users need to view detailed logs during field testing to verify everything is working correctly.

## Public API

### `initLogPanel(): void`

Initializes the log panel component. Must be called after DOM is ready.

- **Throws:** `Error` if required DOM elements (`log-panel`, `status`) are not found
- **Side effects:**
  - Wires up click handler on `#status` to toggle panel
  - Wires up click handler on `#log-panel-close` to hide panel
  - Subscribes to log updates for real-time display

### `showLogPanel(): void`

Shows the log panel and renders all buffered log entries.

- Removes `hidden` class from panel
- Renders current log buffer to `#log-panel-content`
- Auto-scrolls to bottom

### `hideLogPanel(): void`

Hides the log panel by adding `hidden` class.

### `isLogPanelVisible(): boolean`

Returns `true` if the panel is currently visible.

### `toggleLogPanel(): void`

Toggles panel visibility. Called when user taps status area.

### `destroyLogPanel(): void`

Cleanup function for testing. Removes event listeners and subscriptions.

## Invariants & Assumptions

1. **DOM structure:** Requires these elements to exist:
   - `#log-panel` - Container for the panel
   - `#status` - Status element that triggers toggle
   - `#log-panel-content` - Where log entries are rendered
   - `#log-panel-close` - Close button (optional but expected)

2. **Ring buffer:** Log entries are stored in a ring buffer (max 100 entries) maintained by `logger.ts`. Panel displays all buffered entries on show.

3. **Live updates:** When panel is visible, new log entries are appended immediately via subscription. When hidden, no DOM updates occur (performance optimization).

4. **Sticky-bottom auto-scroll:** Content only auto-scrolls to bottom when new entries arrive **if the user was already at (or near) the bottom**. If the user has scrolled up to read older entries, their scroll position is preserved. This prevents the frustrating UX of being yanked back to the bottom while reading. A 50px threshold is used to account for small scroll imprecision.

5. **Log entry structure:** Each entry has:
   - `timestamp: number` - Unix timestamp
   - `level: LogLevel` - DEBUG, INFO, WARN, ERROR
   - `tag: string` - Source module (e.g., "GPS", "Storage")
   - `message: string` - Log message content

6. **XSS prevention:** Log entries are rendered using DOM nodes with `textContent`, not `innerHTML`. This ensures any HTML in `tag` or `message` values is displayed as plain text, not interpreted as markup. This is critical because log messages may contain user-provided data (file names, error messages from external sources).

7. **Z-index layering:** The log panel must render **above** all other overlays, including the session summary panel (z-50). The log panel uses z-index 60. This ensures that opening logs from the summary screen's "View Full Logs" button actually shows them on top. (Fix: 2026-02-26, User Feedback Issue #4a)

8. **Safe area insets:** The `#log-panel-header` uses `padding-top: calc(0.5rem + env(safe-area-inset-top))` to push content below the Android status bar or iPhone notch in WebXR DOM overlay mode. Without this, the close button is hidden behind system UI. The `#hud` similarly uses safe-area padding. (Fix: 2026-02-26, User Feedback Issue #4b)

9. **Close button tap target:** The `#log-panel-close` button has `min-width: 44px; min-height: 44px` to meet Apple HIG / Material Design minimum touch target requirements. (Fix: 2026-02-26, User Feedback Issue #4b)

10. **Toggle discoverability:** The `#status` element has a 📋 icon and `title="Tap to toggle log panel"` attribute to make the tap-to-toggle behavior discoverable. (Fix: 2026-02-26, User Feedback Issue #4b)

## Examples

```typescript
import { initLogPanel, showLogPanel, hideLogPanel } from './ui/log-panel';

// Initialize on app start (after DOM ready)
initLogPanel();

// Programmatically show panel (e.g., from summary screen)
showLogPanel();

// Hide panel
hideLogPanel();
```

## CSS Classes for Log Levels

Each log entry gets a CSS class based on its level:

| Level | CSS Class          | Color                        |
| ----- | ------------------ | ---------------------------- |
| DEBUG | `.log-entry-debug` | Gray (#9ca3af)               |
| INFO  | `.log-entry-info`  | Blue (#60a5fa)               |
| WARN  | `.log-entry-warn`  | Yellow (#fbbf24) + subtle bg |
| ERROR | `.log-entry-error` | Red (#f87171) + subtle bg    |

## Tests

Unit tests in [log-panel.test.ts](log-panel.test.ts) cover:

- DOM element validation (fail-fast on missing elements)
- Click handlers for toggle and close
- Show/hide/toggle behavior
- Log buffer rendering (history and live updates)
- Level-specific CSS classes
- Auto-scroll behavior
- Performance (no updates when hidden)
- XSS prevention (HTML in messages/tags is escaped)
