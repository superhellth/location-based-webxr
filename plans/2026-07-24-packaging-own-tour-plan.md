# 2026-07-24 — Component 5 iteration: load your own tour (implementation plan)

## Context

The packaging demo (`components/packaging/`) currently only ever works with
`store/fixtures/sample-tour.ts` — this was flagged as a "known gap" in
`plans/2026-07-14-packaging-plan.md` ("the demo can pack only after the author
picks files" / no way to try a different tour shape). This iteration adds the
ability to load an author's own `tour.json`, either by uploading a file or by
pasting/editing JSON directly, while keeping the sample tour as the one-click
quick start.

Agreed in a design discussion on 2026-07-24:

| # | Branch | Decision |
|---|--------|----------|
| 1 | Input surface | One editable `<textarea>` for the tour JSON — populated by "Load sample tour", by picking a `.json` file, or by hand. Always editable regardless of source (a file upload is a shortcut to fill the textarea, not a separate path). |
| 2 | Activation | Explicit **"Use this tour"** button, not live-as-you-type validation. Avoids re-parsing/re-rendering asset inputs on every keystroke and mid-edit error flicker. |
| 3 | Sample tour | Stays. "Load sample tour" fills the textarea with `sampleTour` JSON **and** activates it immediately (it's already known-valid — no reason to make the author click twice). |
| 4 | Error type | JSON syntax errors are caught and rethrown as `TourValidationError` (the same class `validateTour` already throws), so the demo has exactly one error type to display, in a new `#tour-json-status` line matching the existing `#pack-status`/`#qr-status` pattern. |
| 5 | Scope boundary | This component **packs**, it does not **unpack** an existing `tour.zip` — that is component 6's (`RangeZipAssetProvider`) job. "Own tour" here means own `tour.json` text, not a hosted archive. |
| 6 | Stale file picks | Activating a new tour (sample or custom) resets the `picked` asset-file map — asset ids from the previous tour are meaningless for a different one. |

---

## Public API addition

```ts
// components/packaging/core/parse-tour-json.ts
import type { Tour } from "../../../store/types.js";

/**
 * Parse and validate raw tour.json text.
 * @throws {TourValidationError} on invalid JSON syntax (rethrown with the same
 * error class validateTour uses) or on any validateTour invariant violation.
 */
export function parseTourJson(text: string): Tour;
```

Implementation: `JSON.parse` wrapped in try/catch (a `SyntaxError` is rethrown
as `TourValidationError` with its message), then `validateTour(parsed)`. No new
error class — the demo (and any future caller) only handles one type.

---

## File layout additions

```
components/packaging/
  core/
    parse-tour-json.ts        parse-tour-json.test.ts
```

`demo.ts` and `index.html` are edited in place (see below); no other new files.

---

## `demo.ts` changes

- Replace the hardcoded `sampleTour` references with a module-level
  `activeTour: Tour` variable, initialized to `sampleTour`.
- `renderAssetInputs()` and `currentTour()` read `activeTour.assets` /
  `activeTour` instead of the fixture directly.
- New element refs: `tourJsonInput` (textarea), `tourJsonFile` (file input),
  `tourJsonStatus` (status line), `use-tour` (button).
- `activateTour(tour: Tour)` helper: sets `activeTour`, clears `picked`,
  re-renders asset inputs + tour state, clears `tourJsonStatus`.
- `"load-sample"` click handler: writes `JSON.stringify(sampleTour, null, 2)`
  into `tourJsonInput`, then calls `activateTour(sampleTour)` directly (already
  valid, decision 3).
- `tourJsonFile` change handler: reads the picked file via `.text()`, writes it
  into `tourJsonInput`. Does **not** activate — the author reviews/edits first,
  same as a paste.
- `"use-tour"` click handler: calls `parseTourJson(tourJsonInput.value)`.
  Success → `activateTour(result)`. Failure → the `TourValidationError`
  message goes in `tourJsonStatus` (`data-state="error"`); `activeTour` is
  untouched.

## `index.html` changes

Insert a new block in the left panel, between the existing buttons row and
`#asset-inputs`:

```html
<label class="field">
  Your own tour.json (paste, edit, or upload)
  <textarea id="tour-json-input" rows="10"></textarea>
</label>
<div class="buttons">
  <input type="file" id="tour-json-file" accept="application/json,.json" />
  <button type="button" id="use-tour">Use this tour</button>
</div>
<p class="status" id="tour-json-status"></p>
```

Reuses the existing `.field`, `.buttons`, `.status`/`[data-state]` styles — no
new CSS rules needed beyond a `textarea` selector alongside the existing
`input[type="file"]` / `input[type="url"]` rule (monospace, same dark
background/border).

---

## Tests

### `core/parse-tour-json.test.ts`
- Valid tour JSON text → returns a `Tour` equal to the parsed object (use
  `sampleTour` stringified as the fixture).
- Malformed JSON syntax (e.g. trailing comma) → throws `TourValidationError`.
- Syntactically valid JSON that fails a `validateTour` invariant (e.g. a
  waypoint referencing an unknown asset id) → throws `TourValidationError`
  carrying `validateTour`'s own message (assert the message is forwarded
  unchanged, not reworded).

No new tests for `demo.ts` — consistent with the rest of `components/packaging/`
and the wider TourBuilder convention (no `demo.test.ts` exists anywhere in the
package); `demo.ts` is exercised manually via the running page, same as today's
"Load sample tour" / "Pack tour" / "Generate QR" flows.

---

## Verification

1. `pnpm run test:unit` — new `parse-tour-json.test.ts` passes, nothing else
   regresses.
2. `pnpm run dev` → open `/components/packaging/`:
   - Page loads with the sample tour active by default (as today).
   - Edit the textarea to a different valid tour JSON (e.g. rename a waypoint
     id) → "Use this tour" → asset inputs + preview update, no error shown.
   - Break the JSON (remove a closing brace) → "Use this tour" → error line
     shows a JSON syntax message; previous tour stays active and packable.
   - Enter valid JSON that violates an invariant (e.g.
     `prefetchRadius < activeRadius`) → error line shows `validateTour`'s
     message.
   - Upload a `.json` file → its contents appear in the textarea, unmodified
     and still editable, tour not yet active until "Use this tour" is clicked.
   - "Load sample tour" after having a custom tour active → textarea + active
     tour both revert to the sample immediately.
3. `pnpm run test:core` — full gate (format, lint, lint:css, jscpd, cycles,
   boundaries, deadcode, typecheck, typecheck:tests, test:unit) passes.

## Deliverable ordering

1. `core/parse-tour-json.ts` + test (TDD).
2. `demo.ts` + `index.html` wiring.
3. `core/README.md` + `components/packaging/README.md` updates.
