# Authoring composition UI refresh: design

Design for a visual/UX/flow pass over the composed Authoring screen (`src/app/authoring/`): onboarding gate, resume-draft prompt, authoring tools shell (GPS status, map, `mountAuthoringView`), and the pack-and-share panel. Reached through iterative browser mockups (`.superpowers/brainstorm/33-1788355876/content/`); this document is the settled record.

## Scope

Whole composed Authoring flow, not just `authoring-view.ts`. Constraints carried through the whole pass:

- Vanilla DOM/CSS only. No framework, no animation library.
- Existing `data-testid` attributes stay stable wherever the underlying element still exists, so `authoring-view.test.ts` / `authoring-app.test.ts` / `onboarding-view.test.ts` need no rewrites for those parts. New interactive elements (accordion header, upload tiles) need new testids. See Testing impact.
- Two features below (waypoint pack merge, accordion) are real behavior changes the user asked for mid-session, not pure restyling. Called out explicitly.
- No technical jargon in any user-facing copy (the author is not assumed to know what a dev proxy or CORS is).
- Zero em dashes anywhere in shipped copy.

## Global patterns (apply everywhere)

- **Section labels**: plain small-caps text (`Waypoints · 2`, `Package`, `Share link`, `Tour Details`, `Export`), muted color, no numbered circle badge.
- **Field pattern**: every labeled value (Name, Description, App base URL, Google Drive/OneDrive/Dropbox link, Prefetch, Active) is a bordered box with the label above and the value below. Replaces the old `<label>` wrapping a bare `<input>`.
- **Icon set** (new, inline SVG, no library: none is installed and this stays vanilla): cube (model), photo (picture), audio waveform, text lines (transcript), chevron (accordion), X (remove/clear). Same X glyph used for every "remove/clear" action across the whole composition (waypoint remove, asset clear). Previously the audio row used a text "Replace" link; that's gone, replaced by the same tile+X pattern as model/picture.
- **Status text**: plain colored text (green/red), never a colored background box.
- **No em dashes**: fixes one real instance in production copy, [authoring-view.ts:264](../src/components/authoring/view/authoring-view.ts:264), `"No waypoints yet — drop one to get started."` becomes `"No waypoints yet. Drop one to get started."` Audit the rest of the composition's strings for the same character before shipping.

## Screen-level transitions

Gate to tools, resume-prompt to tools, and export to share are hard cuts today (`root.innerHTML = ""` / element swap). All three get the same treatment: outgoing screen fades and slides left 18px over 140ms ease-in, then incoming screen fades and slides in from the right (18px to 0) over 220ms ease-out. Direction is deliberately right-to-left (a page turning), not bottom-to-top. Sequential, not overlapping: simplest to implement without keeping two screens mounted at once.

## Onboarding gate (`onboarding-view.ts`)

- Each permission becomes an icon + name + status row instead of one `"Camera: Granted"` text line.
- Icon transitions color/fill: idle (muted) to requesting (blue, spinning ring) to granted (green check) or denied (red X). Colors/backgrounds transition via CSS `transition` on persistent nodes.
- **Denied state shows no "Denied" status word.** The icon (red X) plus the existing explanation paragraph (`explanationFor`) is the only denial messaging. No colored background box around the explanation; it sits in the same position the status text would occupy, plain red text.
- **Architecture change required**: `render()` currently does full `root.innerHTML = ""` on every state change, which defeats CSS transitions (a freshly-created node can't transition from a prior state). Move to targeted per-row updates: update the icon's class/content and the status/explanation text on the existing row nodes instead of rebuilding them. Small component (2 rows, 2 buttons), low risk, worth it because permission requests happen once per session (rare, well within the "occasional, animate it" band, not the "seen hundreds of times, never animate" band).
- Existing tests (`onboarding-view.test.ts`) only assert `root.textContent` contains the explanation and that the granted row doesn't contain "denied". Compatible with this restructure without changes.

## Waypoint card (`authoring-view.ts` → `renderWaypointCard`)

### Header
- Title only (`Waypoint N`). **The raw `wp.id` badge is removed**, the author never needs it.
- Remove becomes an icon-only button (X glyph), not the text "Remove". Same testid (`remove-waypoint-${wp.id}`).

### Collapsible / accordion (new behavior, not just styling)
- Each card can be collapsed/expanded. **Single-expand accordion**: opening one card collapses whichever was open.
- Dropping a new waypoint (`+ Drop Waypoint`) expands the new card and collapses the rest.
- Collapsed state shows a compact summary row: chevron, title, a cluster of small icons for what's attached (cube or photo for the visual, waveform if audio is attached, text-lines if the transcript is non-blank, checked with a trimmed string so whitespace-only counts as empty), and the remove button. If nothing is attached at all, show muted "empty" text instead of icons.
- **Architecture note**: this is local UI state (which card is expanded), not Redux state. It must NOT go through `store.dispatch`/full `render()`, or every keystroke elsewhere would collapse/reset the accordion. Implement as a variable scoped to `mountAuthoringView`'s closure (e.g. `let expandedId: string | null`), read by the render function but never touching the store. The collapsed-card icon cluster must update live while typing the transcript (target that one row's DOM directly on `input`, not a full re-render): confirmed necessary during mockup iteration, a full-render-only update felt broken (icon only changed after collapsing).
- This is scoped smaller than the earlier-rejected "keyed diff for enter/exit motion on add/remove". No card mount/unmount animation is in scope, only expand/collapse of already-rendered cards.

### Proximity fields
- `Prefetch (m)` / `Active (m)` are real `<input type="number">` elements (unchanged functionally) styled to hide the native spinner (`-webkit-appearance:none` on the spin buttons, `-moz-appearance: textfield`). No visible up/down arrows.
- Each label gets a small `(?)` circular hint icon. Hover (desktop) or focus (tap, since tapping a focusable element focuses it, no JS needed) shows a small popover with a speech-bubble arrow pointing back down at the `(?)` it came from. Exact copy, grounded in `plans/Shared-Contract.md` D2/§2.5.3:
  - Prefetch: *"Distance at which this waypoint's media starts downloading, so it's ready before the visitor arrives."*
  - Active: *"Distance at which this waypoint's content actually plays. Must be smaller than the prefetch distance."*
- **Implementation gotcha found in mockup**: the popover must not be clipped. `overflow: hidden` on any ancestor (the collapsible body wrapper, the card itself) clips it on at least one axis. The accordion body needs `overflow: hidden` only while collapsed/collapsing; switch to `overflow: visible` once a card is fully open. The card wrapper itself needs no `overflow: hidden` at all (it was only added for corner-rounding during mockup iteration and wasn't actually needed since the header has no background of its own that would poke past the rounded corner).

### Visual group (Model / Picture)
- Two clickable upload tiles side by side (cube icon + "Model", photo icon + "Picture"), each a `<label>` wrapping the existing hidden `<input type="file">` (`asset-model-${id}` / `asset-sprite-${id}` testids unchanged). Clicking the tile opens the file picker.
- Empty tile: icon + label. Attached tile: filename (from `asset-status-${slot}-${id}`, unchanged testid/semantics) + an X to clear. **Clearing reverts the tile to its empty upload state.** It does not auto-select the other slot; both become available again.
- Hint copy is now static regardless of state (the tile's own highlighted/attached look already communicates which is active), replacing three previous state-dependent sentences:
  > "Choose a model or a picture for this waypoint. Attaching one clears the other."

### Audio
- Same tile pattern as Model/Picture (waveform icon, filename + X when attached) instead of the old label + separate "Replace" text link: one consistent asset-attach affordance everywhere in the card.

### Transcript
- Unchanged (textarea, `transcript-${id}` testid) other than feeding the collapsed-summary text icon described above.

## Waypoints section header

- One row: `Waypoints · N` label on the left, `+ Drop Waypoint` button on the right (was: stacked, heading above button).
- Empty state: dashed-border box, "No waypoints yet. Drop one to get started." (em dash fixed per above).

## Map card and GPS status

- `.map-card` loses its inner padding. The map fills the card edge-to-edge (rounded corners via `overflow: hidden` on the card, needed here because Leaflet's canvas is a hard rectangle).
- The standalone `"Waiting for a live GPS fix…"` text banner above the map is **replaced** by a small pill badge overlaid on the map's top-left corner: pulsing dot + "Waiting for GPS…" while unfixed, solid dot + "Live" once a fix arrives. Chosen over keeping the banner (which just vanished with no transition) after comparing both live in the mockup.

## Pack and share (behavior change, not just visuals)

- **Merges two buttons into one.** Today: `mountAuthoringView`'s "Export & Pack" button only builds the in-memory `Tour`/asset map (`session.exportTour()`); a *separate* "Pack tour" button on the pack-and-share panel does the actual `packTour()` + `downloadZip()`. Going forward, "Export & Pack" does all three (pack, download, and only on success does `onExport` fire, tearing down the authoring view and mounting the share panel). If `packTour()` throws, the error shows inline on the still-mounted authoring/export screen and the button re-enables. Nothing is torn down, no navigation happens, the draft isn't lost.
- Status copy is a plain confirmation, not a byte count: **"Download started."**
- The pack-and-share panel becomes **share-only**: no "Package" section, no "Pack tour" button, no pack status. It opens directly on "Share link".
- Field relabeled: `"Hosted ZIP URL (paste after upload)"` becomes `"Google Drive / OneDrive / Dropbox link"`, with placeholder `"Paste the shared link after uploading tour.zip"`.
- The `prepareHostedZipUrl(...).notes` diagnostic line (proxy/CORS routing detail) is **dropped from the user-facing UI entirely**: it's implementation detail the author has no way to act on. If it's useful for debugging, log it to the console instead of rendering it.
- Generate QR gets real transition states: invalid link turns the input border red and the status red inline (no dialog, no shake); valid link turns the status green and the QR code fades and grows in (`opacity`/`scale` from `.9` to `1`, roughly 200ms ease-out) instead of appearing instantly, consistent with "never animate from scale(0)".

## Tour Details

- Name / Description become the same boxed field pattern as everywhere else (label above value), replacing the plain `<label>` + bare `<input>`.

## Testing impact

- `authoring-view.test.ts`: existing testids (`asset-model-${id}`, `asset-sprite-${id}`, `asset-status-*`, `remove-waypoint-${id}`, `transcript-${id}`, `prefetch-radius-${id}`, `active-radius-${id}`) are unaffected by this design, confirmed by reading the current suite: none assert on the removed id-badge or the old "Remove"/hint text. New tests needed for: accordion expand/collapse (single-open, new-waypoint-expands-and-collapses-rest), the live-updating collapsed-summary icons, clearing a visual tile reverting to empty state, and the tooltip's presence/copy.
- `onboarding-view.test.ts`: current assertions (explanation text present, granted row excludes "denied") are compatible with the redesign as specified above without changes to the suite itself. Add a test for the per-row targeted-update behavior if it's load-bearing (e.g. that a row's DOM node identity is preserved across a status change, to guard the transition-enabling refactor from regressing).
- `pack-and-share-panel.test.ts`: rewrite. The "Pack tour" button/tests move to wherever the merged pack+download+navigate logic lands (likely `authoring-app.test.ts`, alongside the existing composed-flow assertions), and this suite's remaining scope is share-link/QR generation only.
- `authoring-app.test.ts`: extend the composed-flow test for the merged export button (success path: packs, downloads, navigates; failure path: error shown, stays on the authoring screen, draft intact, mirrors the existing "denied permission never reaches the authoring tools screen" negative-path pattern already in this suite).

## Explicitly out of scope (decided against this pass)

- **Per-card enter/exit motion for dropping/removing a waypoint.** Would require replacing `authoring-view.ts`'s full-teardown `render()` with a keyed diff (only touch changed cards) so animations survive rapid unrelated edits. Bigger refactor, more test surface, and waypoints are edited far more often than added/removed, not worth it for this pass. The waypoint list keeps its current full re-render with no motion on add/remove.
- A distinct "Field Instrument" visual identity (teal/graphite + signal-orange accent, route-rail waypoint list) was mocked and considered, but the refined-current-palette direction was chosen instead. No palette change beyond what's already in `app.css`.
