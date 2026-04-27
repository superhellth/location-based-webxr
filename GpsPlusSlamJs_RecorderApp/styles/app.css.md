# styles/app.css — Sidecar

## Purpose

External stylesheet extracted from the inline `<style>` block in `index.html` (Phase 0 refactoring). Contains all CSS rules for the Recorder App's structural layout, overlay stacking model, log panel, and legend color indicators.

## Public API (CSS selectors)

### Behavioral contracts (JS depends on these)

| Selector                              | Purpose                                                      | JS module                |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------ |
| `html, body`                          | Full-screen canvas sizing, no scroll                         | —                        |
| `#app`                                | Relative positioning root, `overflow: hidden`                | —                        |
| `#app > canvas`                       | Abs-positioned canvas (Three.js), out of doc flow            | `webxr-session.ts`       |
| `#hud`                                | Absolute overlay, `pointer-events: none`, z-index 10         | `hud.ts`                 |
| `#hud > *`                            | Re-enables `pointer-events: auto` for interactive children   | `hud.ts`                 |
| `#log-panel`                          | Absolute overlay, z-index 60, flex column                    | `log-panel.ts`           |
| `#log-panel.hidden`                   | Overrides flex display to `display: none`                    | `log-panel.ts`           |
| `#controls, #replay-controls`         | Bottom-anchored overlays, `pointer-events: none`, z-index 10 | `hud.ts`, `replay-ui.ts` |
| `#controls > *, #replay-controls > *` | Re-enables `pointer-events: auto`                            | —                        |

### Visual rules (class names are JS contracts, colors are safe to restyle)

| Selector                                         | Purpose                                                        | JS module            |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------- |
| `.log-entry`, `.log-entry-debug/info/warn/error` | Log entry severity colors                                      | `log-panel.ts`       |
| `.summary-row.warning`                           | Warning highlight for summary rows                             | `session-summary.ts` |
| `.legend-color-raw-gps`                          | Yellow (`#ffff00`) legend swatch matching `VIS_COLORS.RAW_GPS` | — (HTML only)        |
| `.legend-color-fused-path`                       | Cyan (`#00ffff`) legend swatch matching `VIS_COLORS.FUSED_VIO` | — (HTML only)        |

## Invariants & assumptions

- `#app` has `overflow: hidden` to prevent internal scroll offset that causes pointer-event/hitbox mismatch in WebXR DOM overlay mode.
- `#app > canvas` targets the Three.js-created `<canvas>` and makes it absolutely positioned (out of document flow). Without this, the canvas in the normal flow can cause scroll-offset-based hitbox misalignment.
- Safe-area inset support (`env(safe-area-inset-top)`, `viewport-fit=cover`) was **removed** to fix hitbox offset issues in WebXR DOM overlay. See follow-up task to reimplement properly.
- z-index stacking: log-panel (60) > session-summary-panel (z-50 via Tailwind) > HUD/controls (10).
- `pointer-events: none` on `#hud`, `#controls`, `#replay-controls` lets touch/click pass through to the AR canvas; children opt back in with `pointer-events: auto`.
- `env(safe-area-inset-top)` was removed from `#hud` and `#log-panel-header` to fix hitbox offset. Content may overlap system status bar on notched devices until safe-area support is properly reimplemented.
- `#log-panel.hidden { display: none }` is required because the default display is `flex` — Tailwind's `.hidden` utility alone would not override it.

## Tests

- [src/test-utils/html-fixtures.test.ts](../src/test-utils/html-fixtures.test.ts) — loads `app.css` via `loadAppCss()` and validates z-index, tap targets, and safe-area invariants.
