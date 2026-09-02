# Authoring composition UI refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the visual design, hierarchy and a couple of flow decisions across the whole composed Authoring screen (onboarding gate, resume-draft prompt, authoring tools shell, waypoint cards, pack-and-share panel) without changing its underlying framework/store architecture.

**Architecture:** Vanilla DOM/CSS throughout, no new runtime dependency. Two small new shared modules (`src/components/shared/icons.ts`, `src/components/shared/labeled-field.ts`) factor out patterns now used by three different files. Two real behavior changes ride along: waypoint cards gain a local (non-Redux) accordion state, and the Export button absorbs the packaging/download step that used to live on a separate button.

**Tech Stack:** TypeScript, Redux Toolkit (existing `authoring` slice, untouched), Vitest + jsdom, vanilla DOM APIs, hand-rolled inline SVG icons (no icon library is installed).

**Design source:** [`plans/2026-09-02-authoring-composition-ui-refresh-design.md`](2026-09-02-authoring-composition-ui-refresh-design.md).

## Global Constraints

- Vanilla DOM/CSS only. No framework, no animation library, no icon library.
- Every existing `data-testid` that still has an underlying element keeps its exact string (see design doc "Testing impact" and each task's Interfaces block for the specific ids proven unaffected by reading the current suites).
- Zero em dashes (`—`) in any string rendered to the app's user (button labels, status text, hints, error messages, placeholders). Code comments follow the codebase's own existing style, which already uses em dashes freely (see e.g. `asset-attachment.ts`'s file-level comment) — this constraint is about shipped UI copy only.
- No technical jargon in user-facing copy (no "CORS", "proxy", "Worker", "dev server").
- Run `pnpm exec vitest run <file>` (from `GpsPlusSlamJs_TourBuilder/`, no `--config` flag) for every test step in this plan; the package's own `pnpm test` runs the full gate (format, lint, typecheck, unit) and must pass before the final commit of each task.

---

## Task 1: Shared icon set

**Files:**
- Create: `src/components/shared/icons.ts`
- Test: `src/components/shared/icons.test.ts`

**Interfaces:**
- Produces: `ICONS: { cube, photo, audio, text, chevron, x, check, spinner }` — each value a string of inline SVG markup, `currentColor`-stroked so callers control color via CSS. Consumed by Task 5 (onboarding) and Task 6 (waypoint card).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/shared/icons.test.ts
import { describe, expect, it } from "vitest";
import { ICONS } from "./icons.js";

describe("ICONS", () => {
  it("exposes exactly the icon set this composition uses, each as an <svg> string", () => {
    const keys = Object.keys(ICONS).sort();
    expect(keys).toEqual(
      ["audio", "check", "chevron", "cube", "photo", "spinner", "text", "x"].sort(),
    );
    for (const svg of Object.values(ICONS)) {
      expect(svg.trim().startsWith("<svg")).toBe(true);
      expect(svg.trim().endsWith("</svg>")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GpsPlusSlamJs_TourBuilder/`): `pnpm exec vitest run src/components/shared/icons.test.ts`
Expected: FAIL — `Cannot find module './icons.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/shared/icons.ts
/**
 * Shared inline-SVG icon set for the authoring composition (onboarding gate,
 * waypoint card). No icon library is installed in this project, so these are
 * hand-authored: simple, geometric, stroke-only, `currentColor`-driven so
 * every caller sets color via CSS rather than editing the markup.
 */
export const ICONS = {
  cube: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z"/><path d="M4 8 L12 12 L20 8"/><path d="M12 12 L12 20"/></svg>',
  photo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="M21 15 L15 10 L10 14 L7 12 L3 15"/></svg>',
  audio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 12 V12 M7 8 V16 M10 5 V19 M13 10 V14 M16 3 V21 M19 8 V16 M22 12 V12"/></svg>',
  text: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 6 H20 M4 12 H20 M4 18 H13"/></svg>',
  chevron: '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 2 L9 6 L4 10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8 L6.5 11.5 L13 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spinner: '<svg width="14" height="14" viewBox="0 0 16 16" class="icon-spin"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10"/></svg>',
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/shared/icons.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/icons.ts src/components/shared/icons.test.ts
git commit -m "feat(tourbuilder): add shared inline-SVG icon set for authoring UI"
```

---

## Task 2: Shared labeled-field builder (boxed field + optional hint tooltip)

**Files:**
- Create: `src/components/shared/labeled-field.ts`
- Test: `src/components/shared/labeled-field.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `buildLabeledField(labelText: string, input: HTMLElement, testid: string, hint?: string): HTMLLabelElement`. Consumed by Task 6 (`authoring-view.ts`, replacing its local `labeledField`) and Task 8 (`pack-and-share-panel.ts`, replacing its bare `<label>` construction).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/shared/labeled-field.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildLabeledField } from "./labeled-field.js";

describe("buildLabeledField", () => {
  it("wraps the input in a label with the field testid and the label text", () => {
    const input = document.createElement("input");
    const field = buildLabeledField("Name", input, "tour-name");

    expect(field.tagName).toBe("LABEL");
    expect(field.className).toBe("field");
    expect(field.dataset["testid"]).toBe("field-tour-name");
    expect(field.textContent).toContain("Name");
    expect(field.contains(input)).toBe(true);
  });

  it("adds no hint button when hint is omitted", () => {
    const field = buildLabeledField("Name", document.createElement("input"), "tour-name");
    expect(field.querySelector('[data-testid="hint-tour-name"]')).toBeNull();
  });

  it("adds a hint button carrying the hint text when hint is given", () => {
    const field = buildLabeledField(
      "Prefetch (m)",
      document.createElement("input"),
      "prefetch-wp-1",
      "Starts downloading media at this distance.",
    );
    const hintButton = field.querySelector<HTMLButtonElement>(
      '[data-testid="hint-prefetch-wp-1"]',
    );
    expect(hintButton).not.toBeNull();
    expect(hintButton!.tagName).toBe("BUTTON");
    expect(hintButton!.querySelector(".hint-tip")?.textContent).toBe(
      "Starts downloading media at this distance.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/shared/labeled-field.test.ts`
Expected: FAIL — `Cannot find module './labeled-field.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/shared/labeled-field.ts
/**
 * Shared "boxed field" builder: a `<label>` with the label text above the
 * value, used for every labeled value across the authoring composition
 * (Tour Details, waypoint radii, pack-and-share's link fields) so they all
 * look and behave the same way. Optionally carries a `(?)` hint button whose
 * popover text shows on hover or focus (tapping a focusable element focuses
 * it, so this also works on touch with no extra JS).
 */
export function buildLabeledField(
  labelText: string,
  input: HTMLElement,
  testid: string,
  hint?: string,
): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.dataset["testid"] = `field-${testid}`;

  const span = document.createElement("span");
  span.textContent = labelText;
  if (hint !== undefined) {
    span.appendChild(buildHintButton(hint, testid));
  }

  wrapper.append(span, input);
  return wrapper;
}

function buildHintButton(hint: string, testid: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hint-icon";
  button.dataset["testid"] = `hint-${testid}`;
  button.textContent = "?";

  const tip = document.createElement("span");
  tip.className = "hint-tip";
  tip.textContent = hint;
  button.appendChild(tip);

  return button;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/shared/labeled-field.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/labeled-field.ts src/components/shared/labeled-field.test.ts
git commit -m "feat(tourbuilder): add shared boxed-field builder with optional hint tooltip"
```

---

## Task 3: CSS foundations (app.css)

No test file: `src/app/app.css` has no automated coverage in this repo (no visual-regression harness). Verify with `pnpm run dev` (open `http://localhost:8185/src/app/`, no `?tour=` for Authoring mode) after this task and again after Tasks 5, 6, 7, 8 wire the markup that uses these classes — the classes added here render inert until then.

**Files:**
- Modify: `src/app/app.css`

**Interfaces:**
- Produces the CSS classes every later task's markup depends on: `.field` (redefined as a boxed field), `.hint-icon` / `.hint-tip`, `.section-label`, `.wp-header`, `.wp-chevron`, `.wp-summary`, `.wp-body`, `.visual-tiles`, `.visual-tile` (+ `-icon`/`-label`/`-status`/`-input`/`-clear`/`-active` parts), `.audio-tile` (+ same parts), `.icon-btn` (icon-only remove button), `.empty-state` (dashed box), `.map-shell`, `.map-card-flush`, `.map-badge` (+ `-waiting`/`-live`), `.screen-exit`, `.screen-enter`, `input[type="number"]` spinner hiding.
- Removes: `.id-badge`, `.visual-group*`, `.asset-row*`, `.status-banner*` (all superseded).

- [ ] **Step 1: Remove the classes this refresh replaces**

In `src/app/app.css`, delete these now-unused rule blocks (the design doc's Global patterns and Waypoint card sections replace every one of them):

```css
.id-badge {
  font-size: 11px;
  font-family: monospace;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
}

.asset-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-2) 0;
  font-size: 13px;
  flex-wrap: wrap;
}

.asset-row label {
  margin-bottom: 0;
}

.asset-status {
  color: var(--success);
}

.visual-group {
  margin: var(--space-3) 0;
  padding: var(--space-2) var(--space-3);
  background: rgb(255 255 255 / 2%);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
}

.visual-group-label {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

.visual-group-hint {
  margin: 0 0 var(--space-2);
  font-size: 12px;
  color: var(--text-muted);
}

.visual-divider {
  display: block;
  margin: 2px 0;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-muted);
}

.asset-row-active {
  border-left: 2px solid var(--success);
  padding-left: var(--space-2);
}

.asset-row-inactive {
  opacity: 0.5;
}
```

and:

```css
.status-banner {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--accent);
  font-size: 13px;
  transition: opacity var(--duration-base) var(--ease-out);
}

.status-banner:empty {
  display: none;
}
```

Also delete the standalone `.map-card { ... }` rule (Task 3 Step 4 replaces it with a `.map-shell` + `.map-card` pair).

- [ ] **Step 2: Redefine `.field` as a boxed field, add the hint tooltip**

Replace:

```css
label,
.field {
  display: grid;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  font-size: 13px;
  color: var(--text-muted);
}
```

with:

```css
.field {
  display: block;
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: #0a0d13;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.field > span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.field input,
.field textarea {
  display: block;
  width: 100%;
  margin-top: 2px;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 14px;
  color: var(--text);
}

.field input:focus-visible,
.field textarea:focus-visible {
  outline: none;
}

.hint-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  min-height: 0;
  padding: 0;
  border-radius: 50%;
  background: #1b2338;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 9px;
  cursor: help;
}

.hint-icon:hover,
.hint-icon:focus-visible {
  outline: none;
}

.hint-tip {
  display: none;
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 190px;
  padding: var(--space-2) var(--space-3);
  background: #1b2338;
  border: 1px solid var(--primary-hover);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  z-index: 5;
}

.hint-tip::before {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--primary-hover);
}

.hint-tip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-1px);
  border: 5px solid transparent;
  border-top-color: #1b2338;
}

.hint-icon:hover .hint-tip,
.hint-icon:focus .hint-tip {
  display: block;
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type="number"] {
  -moz-appearance: textfield;
}
```

- [ ] **Step 3: Section labels, waypoint accordion, visual/audio tiles, icon button, empty state**

Replace the existing `.authoring-section h2 { ... }` rule:

```css
.authoring-section h2 {
  margin: 0 0 var(--space-3);
  font-size: 15px;
  color: var(--accent);
}
```

with a plain-text section-label style shared by every section header (Tour Details, Waypoints, Export), and everything the redesigned waypoint card needs:

```css
.authoring-section h2,
.section-label {
  margin: 0 0 var(--space-3);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 400;
  color: var(--text-muted);
}

.waypoints-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.waypoints-heading h2 {
  margin: 0;
}

.empty-state {
  margin: 0;
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 0;
  padding: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  flex-shrink: 0;
}

.icon-btn:hover:not(:disabled) {
  color: var(--error);
  border-color: var(--error);
  background: transparent;
}

.wp-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  cursor: pointer;
  user-select: none;
}

.wp-chevron {
  display: flex;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform var(--duration-fast) var(--ease-out);
}

.waypoint-card.open .wp-chevron {
  transform: rotate(90deg);
}

.wp-header h3 {
  margin: 0;
  font-size: 14px;
  flex: 1;
}

.wp-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.wp-summary-empty {
  font-size: 11px;
  font-style: italic;
}

.wp-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--duration-base) var(--ease-out);
}

.waypoint-card.open .wp-body {
  max-height: 900px;
  overflow: visible;
}

.wp-body-in {
  padding: 0 var(--space-3) var(--space-3);
}

.waypoint-card {
  background: rgb(255 255 255 / 3%);
  border-radius: var(--radius-sm);
}

.visual-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin-bottom: 6px;
}

.visual-tile,
.audio-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-3) var(--space-2);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: center;
  position: relative;
}

.audio-tile {
  flex-direction: row;
  justify-content: flex-start;
  text-align: left;
}

.visual-tile-active,
.audio-tile-active {
  border-color: var(--primary-hover);
  background: rgb(61 84 136 / 14%);
}

.visual-tile-icon,
.visual-tile-label,
.audio-tile-icon,
.audio-tile-label {
  color: var(--text-muted);
}

.visual-tile-active .visual-tile-icon,
.visual-tile-active .visual-tile-label,
.audio-tile-active .audio-tile-icon,
.audio-tile-active .audio-tile-label {
  display: none;
}

.visual-tile-status,
.audio-tile-status {
  display: none;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--success);
  width: 100%;
}

.visual-tile-active .visual-tile-status,
.audio-tile-active .audio-tile-status {
  display: flex;
}

.visual-tile-clear,
.audio-tile-clear {
  margin-left: auto;
  color: var(--text-muted);
  background: transparent;
  border: none;
  padding: 2px;
  min-height: 0;
  display: none;
}

.visual-tile-active .visual-tile-clear,
.audio-tile-active .audio-tile-clear {
  display: flex;
}

.visual-tile-clear:hover,
.audio-tile-clear:hover {
  color: var(--error);
  background: transparent;
}

.visual-tile-input,
.audio-tile-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.visual-hint {
  margin: 6px 0 var(--space-4);
  font-size: 11px;
  color: var(--text-muted);
}

.icon-spin {
  animation: icon-spin 900ms linear infinite;
}

@keyframes icon-spin {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 4: Map card (edge-to-edge + GPS badge) and screen transitions**

Replace:

```css
.map-card {
  /* `.map-card` is the Leaflet container element itself (see tour-map.ts) —
     no wrapper div — so its own box must carry the explicit height Leaflet
     needs to size tiles against, not a `> div` child selector. */
  height: 260px;
  padding: var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background-clip: padding-box;
}
```

with:

```css
.map-shell {
  position: relative;
}

.map-card {
  /* `.map-card` is the Leaflet container element itself (see tour-map.ts) —
     no wrapper div — so its own box must carry the explicit height Leaflet
     needs to size tiles against, not a `> div` child selector. `.map-shell`
     is the new wrapper: it never touches Leaflet's own DOM subtree, so the
     GPS badge can sit as its sibling instead of a child of the map. */
  height: 260px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background-clip: padding-box;
}

.map-card-flush {
  padding: 0;
  overflow: hidden;
}

.map-badge {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border-radius: var(--radius-full);
  background: rgb(16 19 26 / 82%);
  color: var(--accent);
  font-size: 12px;
  transition: color var(--duration-base) var(--ease-out);
}

.map-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.map-badge-waiting::before {
  animation: map-badge-pulse 1.2s ease-in-out infinite;
}

.map-badge-live {
  color: var(--success);
}

@keyframes map-badge-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
```

Then, right after the `/* ── Small screens ── */` block's closing brace and before the final `@media (prefers-reduced-motion: reduce)` block, add the screen-transition classes:

```css
/* ── Screen-level transitions (gate ↔ tools ↔ share) ─────────────────────── */

@keyframes screen-exit {
  to {
    opacity: 0;
    transform: translateX(-18px);
  }
}

@keyframes screen-enter {
  from {
    opacity: 0;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.screen-exit {
  animation: screen-exit 140ms ease-in forwards;
}

.screen-enter {
  animation: screen-enter 220ms var(--ease-out) both;
}
```

Finally, extend the existing reduced-motion block so these keyframe animations collapse too (CSS `transition-duration` overrides don't touch `animation-duration`):

```css
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
    animation-delay: 0ms !important;
  }
}
```

(replaces the existing 3-line rule inside that media block.)

- [ ] **Step 5: Manual verification**

Run: `pnpm run dev` (from `GpsPlusSlamJs_TourBuilder/`), open `http://localhost:8185/src/app/`.
Expected: page loads with no console errors from the stylesheet (classes are unused until later tasks wire markup to them — this step only confirms the CSS itself parses and the existing screens still render, since `.field`, `.icon-btn` etc. don't exist in the DOM yet).

- [ ] **Step 6: Commit**

```bash
git add src/app/app.css
git commit -m "feat(tourbuilder): rework authoring composition stylesheet for the UI refresh"
```

---

## Task 4: Screen-transition helper

**Files:**
- Create: `src/app/authoring/screen-transition.ts`
- Test: `src/app/authoring/screen-transition.test.ts`

**Interfaces:**
- Consumes: the `.screen-exit` CSS class from Task 3 (fires `animationend`).
- Produces: `swapScreen(outgoing: HTMLElement, mountIncoming: () => void): void`. Consumed by Task 7 (`authoring-app.ts`, three call sites).

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/authoring/screen-transition.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { swapScreen } from "./screen-transition.js";

describe("swapScreen", () => {
  it("adds the exit class, then removes the outgoing element and mounts the next screen once the exit animation ends", () => {
    const outgoing = document.createElement("div");
    document.body.appendChild(outgoing);
    const mountIncoming = vi.fn();

    swapScreen(outgoing, mountIncoming);

    expect(outgoing.classList.contains("screen-exit")).toBe(true);
    expect(mountIncoming).not.toHaveBeenCalled();
    expect(outgoing.isConnected).toBe(true);

    outgoing.dispatchEvent(new Event("animationend"));

    expect(outgoing.isConnected).toBe(false);
    expect(mountIncoming).toHaveBeenCalledTimes(1);
  });

  it("only fires mountIncoming once even if animationend fires twice", () => {
    const outgoing = document.createElement("div");
    document.body.appendChild(outgoing);
    const mountIncoming = vi.fn();

    swapScreen(outgoing, mountIncoming);
    outgoing.dispatchEvent(new Event("animationend"));
    outgoing.dispatchEvent(new Event("animationend"));

    expect(mountIncoming).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/authoring/screen-transition.test.ts`
Expected: FAIL — `Cannot find module './screen-transition.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/authoring/screen-transition.ts
/**
 * Cross-fades one composed screen into the next: adds the `.screen-exit`
 * class (see `app.css`, 140ms fade + slide left), waits for the CSS
 * animation to finish, removes the outgoing element, then calls
 * `mountIncoming` — which is expected to append the next screen and add
 * `.screen-enter` to it (220ms fade + slide in from the right).
 *
 * Used for every hard-cut screen swap in the composed Authoring flow: gate →
 * tools, resume-prompt → tools, export → share.
 */
export function swapScreen(
  outgoing: HTMLElement,
  mountIncoming: () => void,
): void {
  outgoing.classList.add("screen-exit");
  outgoing.addEventListener(
    "animationend",
    () => {
      outgoing.remove();
      mountIncoming();
    },
    { once: true },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/authoring/screen-transition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/authoring/screen-transition.ts src/app/authoring/screen-transition.test.ts
git commit -m "feat(tourbuilder): add swapScreen helper for authoring screen transitions"
```

---

## Task 5: Onboarding gate redesign

**Files:**
- Modify: `src/components/onboarding/view/onboarding-view.ts`
- Modify: `src/components/onboarding/view/onboarding-view.test.ts`

**Interfaces:**
- Consumes: `ICONS` from Task 1 (`../../shared/icons.js`, relative path `../../../shared/icons.js` from this file's location: `src/components/onboarding/view/` → `src/components/shared/` is `../../shared/icons.js`).
- Produces: no change to `OnboardingGateDeps`/`OnboardingGate` public API — same `mountOnboardingGate(root, deps)` signature, same `[data-testid="row-camera"]` / `[data-testid="row-gps"]` / `[data-testid="explanation-camera"]` / `[data-testid="explanation-gps"]` / `[data-testid="grant-access"]` / `[data-testid="start"]` testids other files and tests already rely on (confirmed by reading `authoring-app.test.ts`, which asserts on `explanation-gps` and `start`/`grant-access`).

- [ ] **Step 1: Write the failing test (targeted-update regression guard)**

Add this test to the existing `describe("mountOnboardingGate", ...)` block in `src/components/onboarding/view/onboarding-view.test.ts` (append after the last `it(...)`, before the closing `});`):

```typescript
  it("updates rows in place rather than rebuilding them (so CSS transitions on the icon/status can run)", async () => {
    const { root, gate } = harness({
      checkCameraPermission: () =>
        Promise.resolve<PermissionStatus>({ supported: true, granted: false }),
      checkGeolocationPermission: () =>
        Promise.resolve<PermissionStatus>({ supported: true, granted: false }),
    });

    const rowBefore = root.querySelector('[data-testid="row-camera"]');
    await vi.waitFor(() => expect(grantButton(root).disabled).toBe(false));
    grantButton(root).click();

    await vi.waitFor(() => expect(startButton(root).disabled).toBe(false));
    const rowAfter = root.querySelector('[data-testid="row-camera"]');

    expect(rowAfter).toBe(rowBefore);
    gate.destroy();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/onboarding/view/onboarding-view.test.ts`
Expected: FAIL — the current `render()` does `root.innerHTML = ""` every state change, so `rowAfter` is a different node than `rowBefore` (`toBe` fails on object identity).

- [ ] **Step 3: Rewrite `onboarding-view.ts` to update rows in place**

Replace the entire contents of `src/components/onboarding/view/onboarding-view.ts` with:

```typescript
/**
 * `mountOnboardingGate` — the reusable DOM view for component 9. Renders the
 * camera/GPS checklist, wires the Grant Access + Start buttons, and owns the
 * user gesture that unlocks the injected `AudioContext` on Start. Reused by
 * Goal-2 composition for both Authoring and Viewing bootstrap, not just the
 * demo (plan §Architecture).
 *
 * Rows are built once and updated in place on every state change (icon
 * class/content, status text, explanation) rather than torn down and
 * rebuilt — a freshly-created DOM node can't CSS-transition from a prior
 * state, and permission status changes are rare enough per session that the
 * small extra bookkeeping here is worth it (see
 * plans/2026-09-02-authoring-composition-ui-refresh-design.md, Onboarding
 * gate section).
 *
 * @see plans/2026-08-07-onboarding-plan.md
 */

import { ICONS } from "../../shared/icons.js";
import {
  canGrantAccess,
  canStart,
  explanationFor,
  gateReducer,
  initialGateState,
  type GateAction,
  type GateState,
  type PermissionState,
  type PermissionKind,
} from "../core/permission-gate.js";
import {
  checkExistingPermissions,
  requestPermissions,
  type OnboardingAdapterDeps,
  type PermissionStatus,
} from "./onboarding-adapter.js";

export interface OnboardingGateDeps {
  readonly checkCameraPermission: () => Promise<PermissionStatus>;
  readonly checkGeolocationPermission: () => Promise<PermissionStatus>;
  readonly requestCameraPermission: () => Promise<PermissionStatus>;
  readonly requestGeolocationPermission: () => Promise<PermissionStatus>;
  /** Injected so tests never touch real Web Audio. */
  readonly createAudioContext: () => AudioContext;
  /** Fires once, only after the resumed context reports `running`. */
  readonly onComplete: (audioContext: AudioContext) => void;
  /** Optional: every new state, for a demo/debug state log. Not used by
   *  Goal-2 composition — the checklist UI itself is the product surface. */
  readonly onStateChange?: (state: GateState) => void;
}

export interface OnboardingGate {
  readonly destroy: () => void;
}

const PERMISSION_LABEL: Record<PermissionKind, string> = {
  camera: "Camera",
  gps: "Location",
};

const ROW_TESTID: Record<PermissionKind, string> = {
  camera: "row-camera",
  gps: "row-gps",
};

interface RowElements {
  readonly root: HTMLElement;
  readonly icon: HTMLElement;
  readonly explanation: HTMLParagraphElement;
}

function buildRow(kind: PermissionKind): RowElements {
  const row = document.createElement("div");
  row.className = "perm-row";
  row.dataset["testid"] = ROW_TESTID[kind];

  const icon = document.createElement("div");
  icon.className = "perm-icon";

  const body = document.createElement("div");
  body.className = "perm-body";

  const name = document.createElement("div");
  name.className = "perm-name";
  name.textContent = PERMISSION_LABEL[kind];

  const explanation = document.createElement("p");
  explanation.className = "perm-explanation";
  explanation.dataset["testid"] = `explanation-${kind}`;
  explanation.hidden = true;

  body.append(name, explanation);
  row.append(icon, body);

  return { root: row, icon, explanation };
}

function updateRow(row: RowElements, state: PermissionState, message: string | null): void {
  row.icon.className = `perm-icon perm-icon-${state}`;
  row.icon.innerHTML =
    state === "requesting" ? ICONS.spinner : state === "granted" ? ICONS.check : state === "denied" ? ICONS.x : "";

  if (message !== null) {
    row.explanation.hidden = false;
    row.explanation.textContent = message;
  } else {
    row.explanation.hidden = true;
    row.explanation.textContent = "";
  }
}

export function mountOnboardingGate(
  root: HTMLElement,
  deps: OnboardingGateDeps,
): OnboardingGate {
  let state: GateState = initialGateState;
  let destroyed = false;

  const cameraRow = buildRow("camera");
  const gpsRow = buildRow("gps");

  const grantButton = document.createElement("button");
  grantButton.dataset["testid"] = "grant-access";
  grantButton.textContent = "Grant Access";

  const startButton = document.createElement("button");
  startButton.className = "primary";
  startButton.dataset["testid"] = "start";
  startButton.textContent = "Start";

  root.append(cameraRow.root, gpsRow.root, grantButton, startButton);

  const dispatch = (action: GateAction): void => {
    if (destroyed) return;
    state = gateReducer(state, action);
    render();
    deps.onStateChange?.(state);
  };

  const adapterDeps: OnboardingAdapterDeps = {
    checkCameraPermission: deps.checkCameraPermission,
    checkGeolocationPermission: deps.checkGeolocationPermission,
    requestCameraPermission: deps.requestCameraPermission,
    requestGeolocationPermission: deps.requestGeolocationPermission,
    dispatch,
  };

  function render(): void {
    updateRow(cameraRow, state.camera, explanationFor(state, "camera"));
    updateRow(gpsRow, state.gps, explanationFor(state, "gps"));
    grantButton.disabled = !canGrantAccess(state);
    startButton.disabled = !canStart(state);
  }

  grantButton.addEventListener("click", () => {
    void requestPermissions(adapterDeps);
  });
  startButton.addEventListener("click", handleStart);

  function handleStart(): void {
    const audioContext = deps.createAudioContext();
    // O7: resume() must be the click handler's first statement — the Web
    // Audio autoplay policy needs the resume call itself inside the gesture.
    const resumed = audioContext.resume();
    void resumed.then(() => {
      const unlocked = audioContext.state === "running";
      dispatch({ type: "audioUnlocked", unlocked });
      if (unlocked) deps.onComplete(audioContext);
    });
  }

  render();
  deps.onStateChange?.(state);
  void checkExistingPermissions(adapterDeps);

  return {
    destroy(): void {
      destroyed = true;
      root.innerHTML = "";
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/onboarding/view/onboarding-view.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Add the onboarding gate's CSS**

Add to `src/app/app.css` (after the `.gate-card` rules, before `/* ── Resume-draft prompt ── */`), replacing the two existing rules that targeted `[data-testid^="row-"]` / `[data-testid^="explanation-"]` by testid (no longer needed now that the rows have real class names):

Replace:

```css
.gate-card [data-testid^="row-"] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.gate-card [data-testid^="explanation-"] {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  /* overrides the inline style="color: red" component 9 sets directly, so
     the warning matches this theme's error tone instead of a raw browser
     red (component 9's own source is untouched — this is a CSS override) */
  color: var(--error) !important;
}

.gate-card > div[data-testid^="row-"] {
  flex-wrap: wrap;
}
```

with:

```css
.perm-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.perm-row:last-of-type {
  border-bottom: none;
}

.perm-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: rgb(255 255 255 / 4%);
  color: var(--text-muted);
  flex-shrink: 0;
  transition:
    background var(--duration-base) var(--ease-out),
    color var(--duration-base) var(--ease-out);
}

.perm-icon-requesting {
  background: rgb(158 193 255 / 12%);
  color: var(--accent);
}

.perm-icon-granted {
  background: rgb(110 231 168 / 14%);
  color: var(--success);
}

.perm-icon-denied {
  background: rgb(248 113 113 / 14%);
  color: var(--error);
}

.perm-body {
  flex: 1;
}

.perm-name {
  font-size: 14px;
  font-weight: 500;
}

.perm-explanation {
  margin: 1px 0 0;
  font-size: 12px;
  color: var(--error);
  transition: color var(--duration-base) var(--ease-out);
}
```

(this removes the note about component 9's inline `style="color: red"` because Step 3 above deleted that inline style along with the "Denied" status word it used to sit next to.)

- [ ] **Step 6: Manual verification**

Run: `pnpm run dev`, open `http://localhost:8185/src/app/`, and step through the onboarding gate (deny one permission via the browser's permission prompt, or DevTools' permission override).
Expected: each permission row shows an icon (gray idle, spinning while requesting, green check or red X), a denied permission shows only the red explanation text (no "Denied" word), and the row's own DOM node visibly does not "flash"/rebuild on state change (no flicker).

- [ ] **Step 7: Commit**

```bash
git add src/components/onboarding/view/onboarding-view.ts src/components/onboarding/view/onboarding-view.test.ts src/app/app.css
git commit -m "feat(tourbuilder): redesign onboarding gate as icon+status rows updated in place"
```

---

## Task 6: Waypoint card, Waypoints section, Tour Details, Export (authoring-view.ts)

**Files:**
- Modify: `src/components/authoring/view/authoring-view.ts`
- Modify: `src/components/authoring/view/authoring-view.test.ts`

**Interfaces:**
- Consumes: `ICONS` from Task 1 (`../../shared/icons.js` relative to `src/components/authoring/view/`), `buildLabeledField` from Task 2 (`../../shared/labeled-field.js`), `removeAsset` action creator (already exported from `../../../store/authoring-slice.js`, not previously imported here).
- Produces: `AuthoringViewDeps` gains one new required field, `packAndDownload: (tour: Tour, assetFiles: ReadonlyMap<AssetId, File>) => Promise<void>` — consumed by Task 7 (`authoring-app.ts`, the only real caller of `mountAuthoringView`). `onExport` keeps its exact name and payload shape, but now fires only after `packAndDownload` resolves, not immediately on click. Every existing testid that has an underlying element is unchanged: `drop-waypoint`, `waypoint-${id}`, `remove-waypoint-${id}`, `prefetch-radius-${id}`, `active-radius-${id}`, `asset-model-${id}` / `asset-sprite-${id}` / `asset-audio-${id}` (file inputs), `asset-status-model-${id}` / `asset-status-sprite-${id}` / `asset-status-audio-${id}`, `transcript-${id}`, `tour-name`, `tour-description`, `export`, `waypoints-empty` (confirmed against the current suite in Task 6 Step 1 changes below). New testids: `export-status`, `clear-model-${id}` / `clear-sprite-${id}` / `clear-audio-${id}`, `wp-toggle-${id}`.

- [ ] **Step 1: Update the existing Export-button test for the new async `packAndDownload` dependency**

In `src/components/authoring/view/authoring-view.test.ts`, update the `harness()` function's `deps` object to add `packAndDownload`, and update the existing Export test. Replace:

```typescript
function harness(initial: AuthoringSliceState = draft()) {
  const root = document.createElement("div");
  document.body.append(root);
  const store = fakeStore(initial);
  const session = {
    dropWaypoint: vi.fn(() => "wp-1"),
    attachAsset: vi.fn(),
    exportTour: vi.fn(() => ({ tour: { id: "t" }, assetFiles: new Map() })),
    destroy: vi.fn(),
  };
  const onExport = vi.fn();
  const deps: AuthoringViewDeps = {
    session: session as unknown as AuthoringViewDeps["session"],
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch: store.dispatch,
    onExport,
  };
  const view = mountAuthoringView(root, deps);
  return { root, store, session, onExport, view };
}
```

with:

```typescript
function harness(
  initial: AuthoringSliceState = draft(),
  overrides: {
    packAndDownload?: AuthoringViewDeps["packAndDownload"];
    dropWaypoint?: () => string | null;
  } = {},
) {
  const root = document.createElement("div");
  document.body.append(root);
  const store = fakeStore(initial);
  const session = {
    dropWaypoint: overrides.dropWaypoint ?? vi.fn(() => "wp-1"),
    attachAsset: vi.fn(),
    exportTour: vi.fn(() => ({ tour: { id: "t" }, assetFiles: new Map() })),
    destroy: vi.fn(),
  };
  const onExport = vi.fn();
  const packAndDownload =
    overrides.packAndDownload ?? vi.fn().mockResolvedValue(undefined);
  const deps: AuthoringViewDeps = {
    session: session as unknown as AuthoringViewDeps["session"],
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch: store.dispatch,
    packAndDownload,
    onExport,
  };
  const view = mountAuthoringView(root, deps);
  return { root, store, session, onExport, packAndDownload, view };
}
```

Replace the existing Export test:

```typescript
  it("Export button calls session.exportTour() and forwards the result to onExport", () => {
    const { root, session, onExport } = harness();
    byTestId(root, "export").click();

    expect(session.exportTour).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith({
      tour: { id: "t" },
      assetFiles: new Map(),
    });
  });
```

with:

```typescript
  it("Export button packs+downloads before calling onExport, and shows a plain confirmation", async () => {
    const { root, session, packAndDownload, onExport } = harness();
    byTestId(root, "export").click();

    expect(session.exportTour).toHaveBeenCalledTimes(1);
    expect(packAndDownload).toHaveBeenCalledWith({ id: "t" }, new Map());

    await vi.waitFor(() =>
      expect(onExport).toHaveBeenCalledWith({
        tour: { id: "t" },
        assetFiles: new Map(),
      }),
    );
    expect(byTestId(root, "export-status").textContent).toBe(
      "Download started.",
    );
  });

  it("shows the error inline and re-enables Export if packAndDownload rejects, without calling onExport", async () => {
    const { root, onExport } = harness(draft(), {
      packAndDownload: vi.fn().mockRejectedValue(new Error("no network")),
    });
    const exportButton = byTestId(root, "export") as HTMLButtonElement;
    exportButton.click();

    expect(exportButton.disabled).toBe(true);
    await vi.waitFor(() =>
      expect(byTestId(root, "export-status").textContent).toBe("no network"),
    );
    expect(exportButton.disabled).toBe(false);
    expect(onExport).not.toHaveBeenCalled();
  });
```

Also add new tests for the accordion and the visual-tile clear behavior — append inside the `describe("mountAuthoringView", ...)` block:

```typescript
  it("waypoints render collapsed by default and expand on header click; opening one collapses the other", () => {
    const { root } = harness(
      draft({
        waypoints: [
          { id: "wp-1", position: { lat: 1, lon: 2 }, prefetchRadius: 25, activeRadius: 10, content: {} },
          { id: "wp-2", position: { lat: 3, lon: 4 }, prefetchRadius: 25, activeRadius: 10, content: {} },
        ],
      }),
    );

    expect(byTestId(root, "waypoint-wp-1").classList.contains("open")).toBe(false);
    expect(byTestId(root, "waypoint-wp-2").classList.contains("open")).toBe(false);

    byTestId(root, "wp-toggle-wp-1").click();
    expect(byTestId(root, "waypoint-wp-1").classList.contains("open")).toBe(true);

    byTestId(root, "wp-toggle-wp-2").click();
    expect(byTestId(root, "waypoint-wp-1").classList.contains("open")).toBe(false);
    expect(byTestId(root, "waypoint-wp-2").classList.contains("open")).toBe(true);
  });

  it("dropping a new waypoint expands it and collapses whatever was open", () => {
    const { root, store } = harness(
      draft({
        waypoints: [
          { id: "wp-1", position: { lat: 1, lon: 2 }, prefetchRadius: 25, activeRadius: 10, content: {} },
        ],
      }),
      { dropWaypoint: () => "wp-2" },
    );
    byTestId(root, "wp-toggle-wp-1").click();
    expect(byTestId(root, "waypoint-wp-1").classList.contains("open")).toBe(true);

    // dropWaypoint() (mocked above to return "wp-2") is what actually adds
    // the waypoint via the real session in production; the fake store here
    // needs its own matching setState so the render the click triggers has
    // something to find at "waypoint-wp-2".
    store.setState(
      draft({
        waypoints: [
          { id: "wp-1", position: { lat: 1, lon: 2 }, prefetchRadius: 25, activeRadius: 10, content: {} },
          { id: "wp-2", position: { lat: 5, lon: 6 }, prefetchRadius: 25, activeRadius: 10, content: {} },
        ],
      }),
    );
    byTestId(root, "drop-waypoint").click();

    expect(byTestId(root, "waypoint-wp-1").classList.contains("open")).toBe(false);
    expect(byTestId(root, "waypoint-wp-2").classList.contains("open")).toBe(true);
  });

  it("clicking a visual tile's clear button dispatches removeAsset for that asset", () => {
    const { root, store } = harness(
      draft({
        assets: [{ id: "asset-1", type: "model", filename: "assets/asset-1.glb" }],
        waypoints: [
          { id: "wp-1", position: { lat: 1, lon: 2 }, prefetchRadius: 25, activeRadius: 10, content: { model: "asset-1" } },
        ],
      }),
    );
    byTestId(root, "clear-model-wp-1").click();

    expect(store.actions).toContainEqual({
      type: "authoring/removeAsset",
      payload: "asset-1",
    });
  });

  it("collapsed summary shows an icon per attached content type, and 'empty' text when nothing is attached", () => {
    const { root } = harness(
      draft({
        assets: [
          { id: "asset-1", type: "model", filename: "assets/asset-1.glb" },
          { id: "asset-2", type: "audio", filename: "assets/asset-2.mp3" },
        ],
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: { model: "asset-1", audio: "asset-2", transcript: "  " },
          },
          { id: "wp-2", position: { lat: 3, lon: 4 }, prefetchRadius: 25, activeRadius: 10, content: {} },
        ],
      }),
    );

    const wp1Summary = byTestId(root, "waypoint-wp-1").querySelector(".wp-summary")!;
    expect(wp1Summary.querySelectorAll("svg")).toHaveLength(2); // model + audio, whitespace-only transcript doesn't count
    expect(byTestId(root, "waypoint-wp-2").querySelector(".wp-summary-empty")?.textContent).toBe("empty");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/components/authoring/view/authoring-view.test.ts`
Expected: FAIL — `AuthoringViewDeps` doesn't have `packAndDownload` yet (TypeScript error surfaces as a test failure/compile error), and the new testids (`wp-toggle-*`, `clear-*`, `export-status`, `.wp-summary`) don't exist.

- [ ] **Step 3: Rewrite `authoring-view.ts`**

Replace the entire contents of `src/components/authoring/view/authoring-view.ts` with:

```typescript
/**
 * `mountAuthoringView` — the DOM wiring for component 10. Renders tour
 * meta inputs, the waypoint list as collapsible cards (radius inputs with
 * hint tooltips, a Model/Picture tile pair, an audio tile, a transcript
 * textarea), a Drop Waypoint button, and an Export button that packs,
 * downloads, and only then hands off to the injected `onExport`. Reacts to
 * store changes via an injected `subscribe`/`getState` pair rather than
 * owning state itself — the `authoring` slice (already built by component 3)
 * is the single source of truth for everything except which waypoint card is
 * expanded, which is local UI state (see the `expandedId` closure variable
 * below) so it survives unrelated re-renders without ever touching Redux.
 *
 * @see plans/2026-08-07-authoring-plan.md
 * @see plans/2026-08-07-authoring-demo-ux-plan.md (card layout, U5/U6)
 * @see plans/2026-09-02-authoring-composition-ui-refresh-design.md
 */

import {
  setTourMeta,
  updateWaypoint,
  removeWaypoint,
  removeAsset,
  type AuthoringSliceState,
} from "../../../store/authoring-slice.js";
import type { AuthoringStateShape } from "../../../store/selectors.js";
import type { AssetSlot } from "../core/asset-attachment.js";
import type { AssetId, Tour } from "../../../store/types.js";
import { ICONS } from "../../shared/icons.js";
import { buildLabeledField } from "../../shared/labeled-field.js";

type AuthoringViewAction =
  | ReturnType<typeof setTourMeta>
  | ReturnType<typeof updateWaypoint>
  | ReturnType<typeof removeWaypoint>
  | ReturnType<typeof removeAsset>;

interface AuthoringViewSession {
  dropWaypoint(): string | null;
  attachAsset(waypointId: string, slot: AssetSlot, file: File): void;
  exportTour(): { tour: Tour; assetFiles: ReadonlyMap<AssetId, File> };
}

export interface AuthoringViewDeps {
  readonly session: AuthoringViewSession;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getState: () => AuthoringStateShape;
  readonly dispatch: (action: AuthoringViewAction) => void;
  /** Packs the tour and starts the download. Rejecting leaves the author on
   *  this screen with the error shown inline — nothing is torn down. */
  readonly packAndDownload: (
    tour: Tour,
    assetFiles: ReadonlyMap<AssetId, File>,
  ) => Promise<void>;
  /** Fires once `packAndDownload` has resolved successfully. */
  readonly onExport: (result: {
    tour: Tour;
    assetFiles: ReadonlyMap<AssetId, File>;
  }) => void;
}

export interface AuthoringView {
  readonly destroy: () => void;
}

const PREFETCH_HINT =
  "Distance at which this waypoint's media starts downloading, so it's ready before the visitor arrives.";
const ACTIVE_HINT =
  "Distance at which this waypoint's content actually plays. Must be smaller than the prefetch distance.";

export function mountAuthoringView(
  root: HTMLElement,
  deps: AuthoringViewDeps,
): AuthoringView {
  let destroyed = false;
  /** Which waypoint card is expanded (accordion: at most one at a time).
   *  Local UI state, deliberately never dispatched — a store round trip on
   *  every collapse/expand would defeat the whole point of keeping it
   *  independent from unrelated store updates. */
  let expandedId: string | null = null;

  function attachedFilename(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    slot: AssetSlot,
  ): string {
    const assetId = wp.content[slot];
    if (!assetId) return "(none)";
    const asset = authoring.assets.find((a) => a.id === assetId);
    return asset?.filename ?? "(none)";
  }

  function buildVisualTile(
    slot: Extract<AssetSlot, "model" | "sprite">,
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
  ): HTMLElement {
    const assetId = wp.content[slot];
    const active = assetId !== undefined;

    const tile = document.createElement("label");
    tile.className = `visual-tile${active ? " visual-tile-active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "visual-tile-icon";
    icon.innerHTML = slot === "model" ? ICONS.cube : ICONS.photo;

    const label = document.createElement("span");
    label.className = "visual-tile-label";
    label.textContent = slot === "model" ? "Model" : "Picture";

    const status = document.createElement("span");
    status.className = "visual-tile-status";
    status.dataset["testid"] = `asset-status-${slot}-${wp.id}`;
    status.textContent = attachedFilename(authoring, wp, slot);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.className = "visual-tile-input";
    fileInput.dataset["testid"] = `asset-${slot}-${wp.id}`;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) deps.session.attachAsset(wp.id, slot, file);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "visual-tile-clear";
    clear.dataset["testid"] = `clear-${slot}-${wp.id}`;
    clear.innerHTML = ICONS.x;
    clear.addEventListener("click", (event) => {
      event.preventDefault(); // don't let the <label> forward the click into the file input
      if (assetId) deps.dispatch(removeAsset(assetId));
    });

    tile.append(icon, label, status, fileInput, clear);
    return tile;
  }

  function buildAudioTile(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
  ): HTMLElement {
    const assetId = wp.content.audio;
    const active = assetId !== undefined;

    const tile = document.createElement("label");
    tile.className = `audio-tile${active ? " audio-tile-active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "audio-tile-icon";
    icon.innerHTML = ICONS.audio;

    const label = document.createElement("span");
    label.className = "audio-tile-label";
    label.textContent = "Audio narration";

    const status = document.createElement("span");
    status.className = "audio-tile-status";
    status.dataset["testid"] = "asset-status-audio-" + wp.id;
    status.textContent = attachedFilename(authoring, wp, "audio");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.className = "audio-tile-input";
    fileInput.dataset["testid"] = `asset-audio-${wp.id}`;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) deps.session.attachAsset(wp.id, "audio", file);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "audio-tile-clear";
    clear.dataset["testid"] = `clear-audio-${wp.id}`;
    clear.innerHTML = ICONS.x;
    clear.addEventListener("click", (event) => {
      event.preventDefault();
      if (assetId) deps.dispatch(removeAsset(assetId));
    });

    tile.append(icon, label, status, fileInput, clear);
    return tile;
  }

  /** One icon per attached content type, in the collapsed header. Trimmed so
   *  a whitespace-only transcript doesn't count as "written". */
  function buildSummary(
    wp: AuthoringSliceState["waypoints"][number],
  ): HTMLElement {
    const summary = document.createElement("span");
    summary.className = "wp-summary";

    const visualIcon =
      wp.content.model !== undefined
        ? ICONS.cube
        : wp.content.sprite !== undefined
          ? ICONS.photo
          : null;
    const hasAudio = wp.content.audio !== undefined;
    const hasTranscript = (wp.content.transcript ?? "").trim().length > 0;

    if (visualIcon === null && !hasAudio && !hasTranscript) {
      const empty = document.createElement("span");
      empty.className = "wp-summary-empty";
      empty.textContent = "empty";
      summary.append(empty);
      return summary;
    }

    if (visualIcon !== null) {
      const span = document.createElement("span");
      span.innerHTML = visualIcon;
      summary.append(span);
    }
    if (hasAudio) {
      const span = document.createElement("span");
      span.innerHTML = ICONS.audio;
      summary.append(span);
    }
    if (hasTranscript) {
      const span = document.createElement("span");
      span.innerHTML = ICONS.text;
      summary.append(span);
    }
    return summary;
  }

  function renderWaypointCard(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    index: number,
  ): HTMLElement {
    const isOpen = wp.id === expandedId;

    const card = document.createElement("div");
    card.className = `waypoint-card${isOpen ? " open" : ""}`;
    card.dataset["testid"] = `waypoint-${wp.id}`;

    const header = document.createElement("div");
    header.className = "wp-header";
    header.dataset["testid"] = `wp-toggle-${wp.id}`;
    header.addEventListener("click", () => {
      expandedId = isOpen ? null : wp.id;
      render();
    });

    const chevron = document.createElement("span");
    chevron.className = "wp-chevron";
    chevron.innerHTML = ICONS.chevron;

    const title = document.createElement("h3");
    title.textContent = `Waypoint ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon-btn";
    removeButton.dataset["testid"] = `remove-waypoint-${wp.id}`;
    removeButton.setAttribute("aria-label", "Remove waypoint");
    removeButton.innerHTML = ICONS.x;
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation(); // don't also toggle the accordion
      deps.dispatch(removeWaypoint(wp.id));
    });

    header.append(chevron, title, buildSummary(wp), removeButton);
    card.append(header);

    const body = document.createElement("div");
    body.className = "wp-body";
    const bodyIn = document.createElement("div");
    bodyIn.className = "wp-body-in";
    body.append(bodyIn);
    card.append(body);

    const prefetchInput = document.createElement("input");
    prefetchInput.type = "number";
    prefetchInput.dataset["testid"] = `prefetch-radius-${wp.id}`;
    prefetchInput.value = String(wp.prefetchRadius);
    prefetchInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { prefetchRadius: Number(prefetchInput.value) },
        }),
      );
    });
    bodyIn.append(
      buildLabeledField(
        "Prefetch (m)",
        prefetchInput,
        `prefetch-${wp.id}`,
        PREFETCH_HINT,
      ),
    );

    const activeInput = document.createElement("input");
    activeInput.type = "number";
    activeInput.dataset["testid"] = `active-radius-${wp.id}`;
    activeInput.value = String(wp.activeRadius);
    activeInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { activeRadius: Number(activeInput.value) },
        }),
      );
    });
    bodyIn.append(
      buildLabeledField(
        "Active (m)",
        activeInput,
        `active-${wp.id}`,
        ACTIVE_HINT,
      ),
    );

    const visualLabel = document.createElement("p");
    visualLabel.className = "section-label";
    visualLabel.textContent = "Visual";
    bodyIn.append(visualLabel);

    const tiles = document.createElement("div");
    tiles.className = "visual-tiles";
    tiles.append(
      buildVisualTile("model", authoring, wp),
      buildVisualTile("sprite", authoring, wp),
    );
    bodyIn.append(tiles);

    const hint = document.createElement("p");
    hint.className = "visual-hint";
    hint.textContent =
      "Choose a model or a picture for this waypoint. Attaching one clears the other.";
    bodyIn.append(hint);

    const audioLabel = document.createElement("p");
    audioLabel.className = "section-label";
    audioLabel.textContent = "Audio";
    bodyIn.append(audioLabel, buildAudioTile(authoring, wp));

    const transcriptInput = document.createElement("textarea");
    transcriptInput.dataset["testid"] = `transcript-${wp.id}`;
    transcriptInput.value = wp.content.transcript ?? "";
    transcriptInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { content: { transcript: transcriptInput.value } },
        }),
      );
    });
    bodyIn.append(
      buildLabeledField("Transcript", transcriptInput, `transcript-${wp.id}`),
    );

    return card;
  }

  function renderWaypointsSection(authoring: AuthoringSliceState): HTMLElement {
    const section = document.createElement("section");
    section.className = "authoring-section";

    const heading = document.createElement("div");
    heading.className = "waypoints-heading";
    const h2 = document.createElement("h2");
    h2.textContent = `Waypoints · ${authoring.waypoints.length}`;
    const dropButton = document.createElement("button");
    dropButton.className = "primary";
    dropButton.dataset["testid"] = "drop-waypoint";
    dropButton.textContent = "+ Drop Waypoint";
    dropButton.addEventListener("click", () => {
      const newId = deps.session.dropWaypoint();
      if (newId !== null) {
        expandedId = newId;
        render();
      }
    });
    heading.append(h2, dropButton);
    section.append(heading);

    if (authoring.waypoints.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.dataset["testid"] = "waypoints-empty";
      empty.textContent = "No waypoints yet. Drop one to get started.";
      section.append(empty);
    } else {
      const list = document.createElement("div");
      list.className = "waypoint-list";
      authoring.waypoints.forEach((wp, index) => {
        list.append(renderWaypointCard(authoring, wp, index));
      });
      section.append(list);
    }

    return section;
  }

  function renderTourDetailsSection(
    authoring: AuthoringSliceState,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "authoring-section";

    const heading = document.createElement("h2");
    heading.textContent = "Tour Details";
    section.append(heading);

    const nameInput = document.createElement("input");
    nameInput.dataset["testid"] = "tour-name";
    nameInput.value = authoring.name;
    nameInput.addEventListener("change", () => {
      deps.dispatch(
        setTourMeta({
          name: nameInput.value,
          description: authoring.description,
        }),
      );
    });
    section.append(buildLabeledField("Name", nameInput, "tour-name"));

    const descriptionInput = document.createElement("input");
    descriptionInput.dataset["testid"] = "tour-description";
    descriptionInput.value = authoring.description;
    descriptionInput.addEventListener("change", () => {
      deps.dispatch(
        setTourMeta({
          name: authoring.name,
          description: descriptionInput.value,
        }),
      );
    });
    section.append(
      buildLabeledField("Description", descriptionInput, "tour-description"),
    );

    return section;
  }

  function renderExportSection(): HTMLElement {
    const section = document.createElement("section");
    section.className = "authoring-section";

    const heading = document.createElement("h2");
    heading.textContent = "Export";
    section.append(heading);

    const exportButton = document.createElement("button");
    exportButton.className = "primary";
    exportButton.dataset["testid"] = "export";
    exportButton.textContent = "Export & Pack";
    section.append(exportButton);

    const status = document.createElement("p");
    status.dataset["testid"] = "export-status";
    section.append(status);

    exportButton.addEventListener("click", () => {
      void (async () => {
        exportButton.disabled = true;
        status.textContent = "";
        status.dataset["state"] = "";
        const result = deps.session.exportTour();
        try {
          await deps.packAndDownload(result.tour, result.assetFiles);
        } catch (error) {
          status.textContent =
            error instanceof Error ? error.message : String(error);
          status.dataset["state"] = "error";
          exportButton.disabled = false;
          return;
        }
        status.textContent = "Download started.";
        status.dataset["state"] = "ok";
        deps.onExport(result);
      })();
    });

    return section;
  }

  function render(): void {
    const authoring = deps.getState().authoring;
    root.innerHTML = "";
    root.append(
      renderTourDetailsSection(authoring),
      renderWaypointsSection(authoring),
      renderExportSection(),
    );
  }

  const unsubscribe = deps.subscribe(() => {
    if (!destroyed) render();
  });
  render();

  return {
    destroy(): void {
      destroyed = true;
      unsubscribe();
      root.innerHTML = "";
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/components/authoring/view/authoring-view.test.ts`
Expected: PASS (all tests, old and new)

- [ ] **Step 5: Manual verification**

Run: `pnpm run dev`, open `http://localhost:8185/src/app/` (Authoring mode, no `?tour=`), complete onboarding, drop a waypoint.
Expected: the card opens expanded; dropping a second waypoint collapses the first and opens the new one; clicking a header toggles it; hovering a `(?)` shows its tooltip with a downward-pointing arrow and it isn't clipped; clicking Model or Picture opens a file picker, attaching one shows its filename and an X that clears it back to the empty tile; the collapsed header shows the right icons once you collapse a card with content attached.

- [ ] **Step 6: Commit**

```bash
git add src/components/authoring/view/authoring-view.ts src/components/authoring/view/authoring-view.test.ts
git commit -m "feat(tourbuilder): redesign waypoint cards (accordion, tiles, hints) and merge pack into Export"
```

---

## Task 7: authoring-app.ts wiring (packAndDownload, GPS badge, screen transitions)

**Files:**
- Modify: `src/app/authoring/authoring-app.ts`
- Modify: `src/app/authoring/authoring-app.test.ts`

**Interfaces:**
- Consumes: `swapScreen` from Task 4, `packTour`/`PackagingError` from `../../components/packaging/core/pack-tour.js` (already exists), `downloadZip` from `gps-plus-slam-app-framework/storage` (already imported by `pack-and-share-panel.ts`, now also imported here), `AuthoringViewDeps.packAndDownload` from Task 6.
- Produces: no public API change (`mountAuthoringApp(root)` signature unchanged). New testid `gps-status` (the map badge) replaces the old `.status-banner` paragraph, which had no testid before (it was targeted by class only), so nothing depended on its absence of a testid.

- [ ] **Step 1: Update the composed-flow test for the merged Export button**

In `src/app/authoring/authoring-app.test.ts`, the existing test clicks `export` and then a separate `pack-tour` button. Replace:

```typescript
    root.querySelector<HTMLButtonElement>('[data-testid="export"]')!.click();

    const packButton = await vi.waitFor(() => {
      const button = root.querySelector<HTMLButtonElement>(
        '[data-testid="pack-tour"]',
      );
      expect(button).not.toBeNull();
      return button!;
    });
    packButton.click();

    await vi.waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledOnce();
    });
```

with:

```typescript
    root.querySelector<HTMLButtonElement>('[data-testid="export"]')!.click();

    await vi.waitFor(() => {
      expect(downloadBlobMock).toHaveBeenCalledOnce();
    });
```

Then add a new test for the failure path, appended inside `describe("Authoring mode composed flow", ...)`:

```typescript
  it("keeps the author on the authoring screen with an inline error if packing fails", async () => {
    downloadBlobMock.mockRejectedValueOnce(new Error("disk full"));
    const { mountAuthoringApp } = await import("./authoring-app.js");
    mountAuthoringApp(root);

    await completeOnboarding(root);
    onGpsPosition!(toGpsPosition(track.track[0]!, Date.now()));
    root
      .querySelector<HTMLButtonElement>('[data-testid="drop-waypoint"]')!
      .click();
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid^="waypoint-"]')).not.toBeNull();
    });

    const exportButton = root.querySelector<HTMLButtonElement>(
      '[data-testid="export"]',
    )!;
    exportButton.click();

    await vi.waitFor(() => {
      expect(
        root.querySelector('[data-testid="export-status"]')?.textContent,
      ).toBe("disk full");
    });
    expect(exportButton.disabled).toBe(false);
    // Never navigated away — the export screen (and its Export button) is
    // still the one in the DOM, not the pack-and-share panel.
    expect(root.querySelector('[data-testid="export"]')).not.toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/authoring/authoring-app.test.ts`
Expected: FAIL — the current code still requires a `pack-tour` button click, and there's no `packAndDownload` wiring yet, so `downloadBlobMock` is never called from the `export` click alone.

- [ ] **Step 3: Update `authoring-app.ts`**

Add these imports at the top of `src/app/authoring/authoring-app.ts` (alongside the existing ones):

```typescript
import { packTour } from "../../components/packaging/core/pack-tour.js";
import { downloadZip } from "gps-plus-slam-app-framework/storage";
import { swapScreen } from "./screen-transition.js";
```

Replace the `mountAuthoringApp` function's `onComplete` callback. Change:

```typescript
  const gate = mountOnboardingGate(gateHost, {
    checkCameraPermission,
    checkGeolocationPermission,
    requestCameraPermission,
    requestGeolocationPermission,
    createAudioContext: () => new AudioContext(),
    onComplete: () => {
      gate.destroy();
      gateHost.remove();
      void startAuthoringFlow(root);
    },
  });
```

to:

```typescript
  const gate = mountOnboardingGate(gateHost, {
    checkCameraPermission,
    checkGeolocationPermission,
    requestCameraPermission,
    requestGeolocationPermission,
    createAudioContext: () => new AudioContext(),
    onComplete: () => {
      swapScreen(gateHost, () => {
        gate.destroy();
        void startAuthoringFlow(root);
      });
    },
  });
```

Replace the resume/discard button handlers in `startAuthoringFlow`. Change:

```typescript
  resumeButton.addEventListener("click", () => {
    promptHost.remove();
    void mountAuthoringTools(root, resumableSessionName);
  });
  discardButton.addEventListener("click", () => {
    promptHost.remove();
    void discardDraft(resumableSessionName).then(() =>
      mountAuthoringTools(root),
    );
  });
```

to:

```typescript
  resumeButton.addEventListener("click", () => {
    swapScreen(promptHost, () => {
      void mountAuthoringTools(root, resumableSessionName);
    });
  });
  discardButton.addEventListener("click", () => {
    swapScreen(promptHost, () => {
      void discardDraft(resumableSessionName).then(() =>
        mountAuthoringTools(root),
      );
    });
  });
```

Replace the `toolsHost` creation to add the entrance animation. Change:

```typescript
  const toolsHost = document.createElement("div");
  toolsHost.className = "tools-shell";
  root.appendChild(toolsHost);
```

to:

```typescript
  const toolsHost = document.createElement("div");
  toolsHost.className = "tools-shell screen-enter";
  root.appendChild(toolsHost);
```

Replace the GPS-status-banner + map-card block. Change:

```typescript
  // AC13: explicit waiting state until the first live GPS fix arrives —
  // Drop Waypoint has nothing to drop at until then.
  const gpsStatus = document.createElement("p");
  gpsStatus.className = "status-banner";
  gpsStatus.textContent = "Waiting for a live GPS fix…";
  toolsHost.appendChild(gpsStatus);

  // `.map-card` is the Leaflet container element itself (see tour-map.ts /
  // app.css) — no wrapper div — so it must be the element passed to
  // createTourMap directly, not a plain child of a `.map-card` section.
  const mapHost = document.createElement("div");
  mapHost.className = "map-card";
  toolsHost.appendChild(mapHost);
  const tourMap = createTourMap(mapHost);
  tourMap?.show();
```

to:

```typescript
  // `.map-shell` never touches Leaflet's own DOM subtree — the GPS badge is
  // its sibling, not a child of `.map-card`, so Leaflet's internal rendering
  // can never clobber it. `.map-card` stays the direct element passed to
  // createTourMap, exactly as before (see tour-map.ts / app.css).
  const mapShell = document.createElement("div");
  mapShell.className = "map-shell";
  toolsHost.appendChild(mapShell);

  const mapHost = document.createElement("div");
  mapHost.className = "map-card map-card-flush";
  mapShell.appendChild(mapHost);
  const tourMap = createTourMap(mapHost);
  tourMap?.show();

  // AC13: explicit waiting state until the first live GPS fix arrives —
  // Drop Waypoint has nothing to drop at until then.
  const gpsBadge = document.createElement("div");
  gpsBadge.className = "map-badge map-badge-waiting";
  gpsBadge.dataset["testid"] = "gps-status";
  gpsBadge.textContent = "Waiting for GPS…";
  mapShell.appendChild(gpsBadge);
```

Replace `updateMapPosition`'s fix-arrival branch. Change:

```typescript
  let hasGpsFix = false;
  function updateMapPosition(pos: TourCoord): void {
    if (!hasGpsFix) {
      hasGpsFix = true;
      gpsStatus.textContent = "";
    }
    tourMap?.setGpsPosition(pos.lat, pos.lon);
    tourMap?.render(
      buildMapData({ userPosition: { lat: pos.lat, lng: pos.lon } }),
    );
  }
```

to:

```typescript
  let hasGpsFix = false;
  function updateMapPosition(pos: TourCoord): void {
    if (!hasGpsFix) {
      hasGpsFix = true;
      gpsBadge.className = "map-badge map-badge-live";
      gpsBadge.textContent = "Live";
    }
    tourMap?.setGpsPosition(pos.lat, pos.lon);
    tourMap?.render(
      buildMapData({ userPosition: { lat: pos.lat, lng: pos.lon } }),
    );
  }
```

Finally, wire `packAndDownload` and the export-to-share transition. Change:

```typescript
  const view = mountAuthoringView(authoringRoot, {
    session,
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch,
    onExport: (result: ReturnType<typeof session.exportTour>) => {
      exported = true;
      disableBeforeUnloadWarning();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockHandle?.release();
      void durable.discard(); // packed successfully — nothing left to resume
      view.destroy();
      authoringRoot.remove();
      mountPackAndSharePanel(toolsHost, {
        tour: result.tour,
        assetFiles: result.assetFiles,
      });
    },
  });
```

to:

```typescript
  const view = mountAuthoringView(authoringRoot, {
    session,
    subscribe: store.subscribe,
    getState: store.getState,
    dispatch,
    packAndDownload: async (tour, assetFiles) => {
      const blob = await packTour(tour, new Map(assetFiles));
      await downloadZip(blob, "tour.zip");
    },
    // The share panel needs neither the tour nor the asset files (only
    // packaging did, and that already ran in packAndDownload above), so
    // the parameter below is intentionally unused.
    onExport: (_result: ReturnType<typeof session.exportTour>) => {
      exported = true;
      disableBeforeUnloadWarning();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      wakeLockHandle?.release();
      void durable.discard(); // packed successfully — nothing left to resume
      swapScreen(authoringRoot, () => {
        view.destroy();
        const shareHost = mountPackAndSharePanel(toolsHost);
        shareHost.root.classList.add("screen-enter");
      });
    },
  });
```

(`mountPackAndSharePanel` gains a `root` field on its return value in Task 8, next. Until that lands, this line is a type error on purpose — Task 8 is this task's other half; don't run the test suite or commit yet. Go straight to Task 8, which verifies and commits both tasks' files together.)

---

## Task 8: Pack-and-share panel becomes share-only

**This task finishes Task 7.** Task 7 left `authoring-app.ts`/`authoring-app.test.ts` mid-change (a type error, tests not run, nothing committed) because both tasks touch the same seam — `mountPackAndSharePanel`'s return type. This task's verification and commit steps cover both tasks' files together.

**Files:**
- Modify: `src/app/authoring/pack-and-share-panel.ts`
- Modify: `src/app/authoring/pack-and-share-panel.test.ts`

**Interfaces:**
- Consumes: `buildLabeledField` from Task 2.
- Produces: `mountPackAndSharePanel(root: HTMLElement): { destroy(): void; root: HTMLElement }` — drops the `deps` parameter entirely (the panel no longer needs the `Tour`/asset files, since packaging now happens earlier in `authoring-view.ts`), and the return type gains `root` (the panel's own top-level element) so Task 7 can add `.screen-enter` to it after mounting. Drops the `pack-tour` testid, the `pack-status` testid, and the `url-notes` testid entirely (all superseded — see design doc's "Pack and share" section). Keeps `generate-qr` and `qr-status` testids unchanged.

- [ ] **Step 1: Rewrite the test file for the share-only panel**

Replace the entire contents of `src/app/authoring/pack-and-share-panel.test.ts` with:

```typescript
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import type * as StorageModule from "gps-plus-slam-app-framework/storage";

vi.mock("gps-plus-slam-app-framework/storage", async () => {
  const actual = await vi.importActual<typeof StorageModule>(
    "gps-plus-slam-app-framework/storage",
  );
  return {
    ...actual,
    normalizeShareUrl: (raw: string) => raw,
  };
});

vi.mock("../../components/packaging/core/generate-qr.js", () => ({
  generateQr: vi.fn((url: string) => Promise.resolve(`QR-DATA(${url})`)),
}));

vi.mock("../../components/packaging/view/qr-view.js", () => ({
  renderQrSvg: vi.fn((host: HTMLElement, data: string) => {
    host.textContent = String(data);
  }),
}));

import { mountPackAndSharePanel } from "./pack-and-share-panel.js";

function setup() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const panel = mountPackAndSharePanel(root);
  const urlInputs =
    root.querySelectorAll<HTMLInputElement>('input[type="url"]');
  const zipUrlInput = urlInputs[1]!;
  const zipField = zipUrlInput.closest(".field")!;
  const qrStatus = root.querySelector<HTMLParagraphElement>(
    '[data-testid="qr-status"]',
  )!;
  const generateButton = root.querySelector<HTMLButtonElement>(
    '[data-testid="generate-qr"]',
  )!;
  return { root, panel, zipUrlInput, zipField, qrStatus, generateButton };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("mountPackAndSharePanel", () => {
  it("has no pack/download controls left — it opens directly on the share step", () => {
    const { root } = setup();
    expect(root.querySelector('[data-testid="pack-tour"]')).toBeNull();
    expect(root.querySelector('[data-testid="pack-status"]')).toBeNull();
    expect(root.querySelector('[data-testid="url-notes"]')).toBeNull();
  });

  it("labels the zip-url field for a non-technical author", () => {
    const { zipField } = setup();
    expect(zipField.textContent).toContain(
      "Google Drive / OneDrive / Dropbox link",
    );
  });

  it("shows no error and builds the link unchanged for an ordinary host", async () => {
    const { zipUrlInput, qrStatus, generateButton } = setup();
    zipUrlInput.value = "https://example.com/tour.zip";
    generateButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(qrStatus.dataset["state"]).toBe("ok");
    expect(qrStatus.textContent).toContain(
      encodeURIComponent("https://example.com/tour.zip"),
    );
  });

  it("routes a Dropbox URL through the dev proxy without showing any proxy/CORS text", async () => {
    const original = import.meta.env.DEV;
    (import.meta.env as { DEV: boolean }).DEV = true;
    try {
      const { root, zipUrlInput, qrStatus, generateButton } = setup();
      const raw = "https://dl.dropboxusercontent.com/scl/fi/abc/tour.zip";
      zipUrlInput.value = raw;
      generateButton.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(qrStatus.textContent).toContain(
        encodeURIComponent(`/tour-proxy?u=${encodeURIComponent(raw)}`),
      );
      expect(root.textContent).not.toMatch(/CORS|proxy|Worker/i);
    } finally {
      (import.meta.env as { DEV: boolean }).DEV = original;
    }
  });

  it("rejects an invalid link before building a URL", async () => {
    const { zipUrlInput, qrStatus, generateButton } = setup();
    zipUrlInput.value = "not-a-url";
    generateButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(qrStatus.dataset["state"]).toBe("error");
    expect(qrStatus.textContent).toBe("Enter a shared link first.");
  });

  it("exposes its top-level element as .root, for the caller's entrance transition", () => {
    const { panel, root } = setup();
    expect(panel.root.parentElement).toBe(root);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/authoring/pack-and-share-panel.test.ts`
Expected: FAIL — the current panel still has a `pack-tour` section, the field is still labeled "Hosted ZIP URL", the error message is the old wording, and `mountPackAndSharePanel(...).root` doesn't exist.

- [ ] **Step 3: Rewrite `pack-and-share-panel.ts`**

Replace the entire contents of `src/app/authoring/pack-and-share-panel.ts` with:

```typescript
/**
 * Share step of composed Authoring mode (plan
 * `plans/2026-08-14-authoring-composition-plan.md`, AC5, revised by
 * plans/2026-09-02-authoring-composition-ui-refresh-design.md). Packing and
 * downloading now happen on the authoring view's own Export button (see
 * `authoring-view.ts`'s `packAndDownload` dependency); by the time this
 * panel mounts, `tour.zip` has already been packed and downloaded. This
 * panel's only job is turning the URL the author uploads it to into a
 * scannable link, using packaging's `core/` (`buildTourUrl`, `generateQr`)
 * and `view/renderQrSvg`. It no longer needs the `Tour`/asset files
 * themselves at all (only packaging ever used them, and that now happens
 * earlier, in `authoring-view.ts`), so it takes no deps beyond `root`.
 */
import { buildTourUrl } from "../../components/packaging/core/build-tour-url.js";
import { generateQr } from "../../components/packaging/core/generate-qr.js";
import { renderQrSvg } from "../../components/packaging/view/qr-view.js";
import { prepareHostedZipUrl } from "../../components/shared/hosted-zip-url.js";
import { buildLabeledField } from "../../components/shared/labeled-field.js";

export function mountPackAndSharePanel(
  root: HTMLElement,
): { destroy(): void; root: HTMLElement } {
  const section = document.createElement("section");
  section.className = "panel";

  const heading = document.createElement("h2");
  heading.textContent = "Share link";
  section.appendChild(heading);

  const appBaseInput = document.createElement("input");
  appBaseInput.type = "url";
  appBaseInput.value = `${location.origin}${location.pathname}`;
  section.append(
    buildLabeledField("App base URL", appBaseInput, "app-base-url"),
  );

  const zipUrlInput = document.createElement("input");
  zipUrlInput.type = "url";
  zipUrlInput.placeholder = "Paste the shared link after uploading tour.zip";
  const zipUrlField = buildLabeledField(
    "Google Drive / OneDrive / Dropbox link",
    zipUrlInput,
    "zip-url",
  );
  section.append(zipUrlField);

  const generateButton = document.createElement("button");
  generateButton.className = "primary";
  generateButton.dataset["testid"] = "generate-qr";
  generateButton.textContent = "Generate QR";
  section.appendChild(generateButton);

  const qrStatus = document.createElement("p");
  qrStatus.dataset["testid"] = "qr-status";
  section.appendChild(qrStatus);

  const qrHost = document.createElement("div");
  qrHost.className = "qr-host";
  section.appendChild(qrHost);

  generateButton.addEventListener("click", () => {
    void (async () => {
      qrStatus.textContent = "";
      qrStatus.dataset["state"] = "";
      zipUrlField.classList.remove("field-error");
      qrHost.classList.remove("qr-host-show");
      qrHost.textContent = "";

      // AC13: buildTourUrl only validates appBaseUrl — a garbage zipUrl would
      // otherwise silently produce a QR pointing at a broken "?tour=" link.
      try {
        new URL(zipUrlInput.value);
      } catch {
        qrStatus.textContent = "Enter a shared link first.";
        qrStatus.dataset["state"] = "error";
        zipUrlField.classList.add("field-error");
        return;
      }

      // The proxy-routing decision is entirely an implementation detail —
      // the author can't act on it, so its notes never reach the UI.
      const prepared = prepareHostedZipUrl(
        zipUrlInput.value,
        import.meta.env.DEV,
      );
      if (prepared.notes.length > 0) {
        console.info("[pack-and-share]", prepared.notes.join(" | "));
      }

      try {
        const url = buildTourUrl(appBaseInput.value, prepared.url);
        renderQrSvg(qrHost, await generateQr(url));
        qrHost.classList.add("qr-host-show");
        qrStatus.textContent = url;
        qrStatus.dataset["state"] = "ok";
      } catch (error) {
        qrStatus.textContent =
          error instanceof Error ? error.message : String(error);
        qrStatus.dataset["state"] = "error";
        zipUrlField.classList.add("field-error");
      }
    })();
  });

  root.appendChild(section);

  return {
    root: section,
    destroy() {
      section.remove();
    },
  };
}
```

- [ ] **Step 4: Add the QR-transition and boxed-field CSS this panel now needs**

Add to `src/app/app.css`, in the `/* ── Pack & share panel ── */` section (after the existing `.panel h2 { ... }` rule):

```css
.qr-host {
  width: 0;
  height: 0;
  margin: 0 auto;
  overflow: hidden;
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out),
    width var(--duration-base) var(--ease-out),
    height var(--duration-base) var(--ease-out);
}

.qr-host-show {
  width: 200px;
  height: 200px;
  margin-top: var(--space-3);
  opacity: 1;
  transform: scale(1);
}

.field-error {
  border-color: var(--error);
  transition: border-color var(--duration-base) var(--ease-out);
}
```

(`.field-error` is applied/removed directly on the zip-url field by `pack-and-share-panel.ts`'s Generate QR handler — see Step 3 above — rather than derived in CSS from `qr-status`'s sibling position, since the two elements aren't adjacent siblings in the DOM.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/authoring/pack-and-share-panel.test.ts src/app/authoring/authoring-app.test.ts`
Expected: PASS for both files now that `mountPackAndSharePanel` returns `root` (resolving Task 7's deferred type error).

- [ ] **Step 6: Manual verification**

Run: `pnpm test` (from `GpsPlusSlamJs_TourBuilder/`) for the full gate, then `pnpm run dev` and walk the whole flow once by hand: onboarding → drop a waypoint → attach a model and audio → Export & Pack (watch it download and slide to the share screen) → paste any URL → Generate QR (watch the red/green transition and the QR grow in).
Expected: full gate green; the manual walk matches every mockup decision in the design doc.

- [ ] **Step 7: Commit (covers Task 7 and Task 8 together)**

```bash
git add src/app/authoring/authoring-app.ts src/app/authoring/authoring-app.test.ts src/app/authoring/pack-and-share-panel.ts src/app/authoring/pack-and-share-panel.test.ts src/app/app.css
git commit -m "feat(tourbuilder): merge pack+download into Export, add GPS map badge and screen transitions, make pack-and-share share-only"
```
