# End-of-Tour Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the visitor a distinct "you're done" moment once every waypoint has been visited — a dismissible in-session notice the instant it happens, and a dedicated End-of-Tour screen once they actually end the session — without ever forcing them out of AR/preview mid-experience.

**Architecture:** Pure composition-layer change inside `GpsPlusSlamJs_TourBuilder/src/app/viewing/`. No changes to the proximity state machine, zones, or the store slices — `selectNextUnvisitedWaypoint` already reports completion. Three additive pieces: (1) the HUD's existing one-shot notice becomes dismissible, (2) a new screen (`mountTourCompleteScreen`) joins the existing screen builders in `screens.ts`, (3) `viewing-app.ts` wires a completion check into session-end routing and into the live progress subscription.

**Tech Stack:** TypeScript, Vitest + jsdom (existing `viewing-app.test.ts` harness — real onboarding gate, real viewing store, mocked AR controller/scene/permissions), no new dependencies.

## Global Constraints

- Reuse existing CSS classes only (`.panel`, `button.primary`, `.muted`, `.icon-btn`, `error-banner`) — the user explicitly asked for the same UI style as every other screen in the app. The only new CSS is a small layout wrapper for the notice's dismiss button (`.ar-hud-notice`), not a new visual style.
- No new test files — `hud.ts` and `screens.ts` have never had their own test files in this codebase; both are tested exclusively through `viewing-app.test.ts` (composition level). Follow that pattern.
- No auto-timers or auto-navigation. The notice is dismissed by the visitor; the complete screen only appears when the visitor ends the session themselves.

---

### Task 1: Dismissible HUD notice

**Files:**
- Modify: `src/app/viewing/hud.ts`
- Modify: `src/app/app.css`
- Test: `src/app/viewing/viewing-app.test.ts`

**Interfaces:**
- Consumes: `ICONS.x` from `../../components/shared/icons.js` (existing shared icon set, already used the same way in `authoring-view.ts` for remove/clear buttons).
- Produces: no new exported method on `Hud` — `showNotice(message)` keeps its exact existing signature and behavior. The DOM testid `viewing-hud-notice` moves from the inner `<p>` to the wrapping `<div>` (the element whose `.hidden` now reflects visibility) — this is a fresh testid nobody currently queries (verified: no test file references `viewing-hud-notice` today). A new testid `viewing-hud-notice-dismiss` is added for the close button, for later tasks/tests to use.

- [ ] **Step 1: Write the failing test**

Add to `src/app/viewing/viewing-app.test.ts`, right before the final `});` that closes the `describe("Viewing mode screen flow", ...)` block:

```ts
  it("the HUD notice can be dismissed without ending the session", async () => {
    const { controller } = fakeController();
    let triggerNotice: (() => void) | undefined;
    const startArScene = vi.fn(
      (options: { onAudioBlocked?: () => void }) => {
        triggerNotice = options.onAudioBlocked;
        return { scene: {} as never, dispose: vi.fn() };
      },
    );

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({
        startArScene: startArScene as unknown as ViewingAppDeps["startArScene"],
      }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(query(root, "viewing-hud")).not.toBeNull();
    });
    triggerNotice?.();

    const notice = query(root, "viewing-hud-notice") as HTMLElement;
    expect(notice.hidden).toBe(false);

    (query(root, "viewing-hud-notice-dismiss") as HTMLButtonElement).click();
    expect(notice.hidden).toBe(true);
    // Dismissing the notice does not end the session.
    expect(query(root, "viewing-hud")).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `GpsPlusSlamJs_TourBuilder/`):
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "the HUD notice can be dismissed"
```
Expected: FAIL — `query(root, "viewing-hud-notice-dismiss")` is `null` (the button doesn't exist yet), so the click throws `Cannot read properties of null (reading 'click')`.

- [ ] **Step 3: Implement the dismissible notice in `hud.ts`**

Replace the current notice element and mount body in `src/app/viewing/hud.ts`. First, add the icon import at the top of the file (after the existing top-of-file doc comment, before `export interface HudOptions`):

```ts
import { ICONS } from "../../components/shared/icons.js";

```

Then replace this block:

```ts
  const notice = document.createElement("p");
  notice.className = "error-banner";
  notice.dataset.testid = "viewing-hud-notice";
```

with:

```ts
  const noticeWrap = document.createElement("div");
  noticeWrap.className = "ar-hud-notice";
  noticeWrap.dataset.testid = "viewing-hud-notice";
  noticeWrap.hidden = true;

  const noticeText = document.createElement("p");
  noticeText.className = "error-banner";

  const noticeDismiss = document.createElement("button");
  noticeDismiss.type = "button";
  noticeDismiss.className = "icon-btn";
  noticeDismiss.innerHTML = ICONS.x;
  noticeDismiss.setAttribute("aria-label", "Dismiss");
  noticeDismiss.dataset.testid = "viewing-hud-notice-dismiss";
  noticeDismiss.addEventListener("click", () => {
    noticeWrap.hidden = true;
  });

  noticeWrap.append(noticeText, noticeDismiss);
```

Then replace this line:

```ts
  element.append(status, notice, controls);
```

with:

```ts
  element.append(status, noticeWrap, controls);
```

Finally, replace the `showNotice` method body:

```ts
    showNotice(message) {
      notice.textContent = message;
      notice.hidden = false;
    },
```

with:

```ts
    showNotice(message) {
      noticeText.textContent = message;
      noticeWrap.hidden = false;
    },
```

- [ ] **Step 4: Add the notice-row layout to `app.css`**

In `src/app/app.css`, find the `.ar-hud-controls` rule:

```css
.ar-hud-controls {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
```

Add this new rule directly after it:

```css

.ar-hud-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.ar-hud-notice p {
  flex: 1;
  margin: 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "the HUD notice can be dismissed"
```
Expected: PASS

- [ ] **Step 6: Run the full viewing test file to confirm no regressions**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts
```
Expected: all tests pass (existing `showNotice` call sites — audio-blocked in AR and in preview, offline tiles — are unaffected since `showNotice`'s signature and effect are unchanged).

- [ ] **Step 7: Typecheck and lint**

Run:
```bash
pnpm run typecheck
pnpm run lint
```
Expected: no new errors (the pre-existing `no-console` warning in `pack-and-share-panel.ts` is unrelated and may still appear).

- [ ] **Step 8: Commit**

```bash
git add src/app/viewing/hud.ts src/app/app.css src/app/viewing/viewing-app.test.ts
git commit -m "feat(tourbuilder): make the in-session HUD notice dismissible

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Tour-complete screen + session-end routing

**Files:**
- Modify: `src/app/viewing/screens.ts`
- Modify: `src/app/viewing/viewing-app.ts`
- Test: `src/app/viewing/viewing-app.test.ts`

**Interfaces:**
- Consumes: `panel()`, `heading()`, `paragraph()` (private helpers already in `screens.ts`), `Screen` (already exported from `screens.ts`), `selectNextUnvisitedWaypoint`/`selectVisitedWaypointIds` (already imported in `viewing-app.ts`).
- Produces:
  ```ts
  export interface TourCompleteScreenOptions {
    readonly waypointCount: number;
    readonly mapHost: HTMLElement;
    readonly onRestartTour: () => void;
    readonly onBackToOverview: () => void;
  }
  export function mountTourCompleteScreen(
    root: HTMLElement,
    options: TourCompleteScreenOptions,
  ): Screen;
  ```
  and, in `viewing-app.ts`'s closure, `function isTourComplete(): boolean` — reused by Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/viewing/viewing-app.test.ts`, right before the final `});`:

```ts
  it("shows the tour-complete screen when every stop was already visited before the session started", async () => {
    const storage = fakeStorage({
      "tour:tour-castle": '{"visited":["wp-gate","wp-tower"]}',
    });
    const { controller, endSessionExternally } = fakeController();

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({ progressStorage: storage }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(query(root, "viewing-hud")).not.toBeNull();
    });
    endSessionExternally();

    await vi.waitFor(() => {
      expect(query(root, "viewing-tour-complete")).not.toBeNull();
    });
    expect(query(root, "viewing-entry")).toBeNull();
  });

  it("returns to the normal entry screen when the tour is not yet complete", async () => {
    const storage = fakeStorage({
      "tour:tour-castle": '{"visited":["wp-gate"]}',
    });
    const { controller, endSessionExternally } = fakeController();

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({ progressStorage: storage }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(query(root, "viewing-hud")).not.toBeNull();
    });
    endSessionExternally();

    await vi.waitFor(() => {
      expect(query(root, "viewing-entry")).not.toBeNull();
    });
    expect(query(root, "viewing-tour-complete")).toBeNull();
  });

  it("Restart tour on the complete screen clears progress and returns to a fresh entry screen", async () => {
    const storage = fakeStorage({
      "tour:tour-castle": '{"visited":["wp-gate","wp-tower"]}',
    });
    const { controller, endSessionExternally } = fakeController();

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({ progressStorage: storage }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(query(root, "viewing-hud")).not.toBeNull();
    });
    endSessionExternally();
    await vi.waitFor(() => {
      expect(query(root, "viewing-tour-complete")).not.toBeNull();
    });

    (query(root, "viewing-restart") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(query(root, "viewing-tour-summary")!.textContent).toBe(
        "2 stops",
      );
    });
    expect(storage.getItem("tour:tour-castle")).toBeNull();
  });

  it("Back to overview on the complete screen returns to the entry screen with progress intact", async () => {
    const storage = fakeStorage({
      "tour:tour-castle": '{"visited":["wp-gate","wp-tower"]}',
    });
    const { controller, endSessionExternally } = fakeController();

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({ progressStorage: storage }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(query(root, "viewing-hud")).not.toBeNull();
    });
    endSessionExternally();
    await vi.waitFor(() => {
      expect(query(root, "viewing-tour-complete")).not.toBeNull();
    });

    (query(root, "viewing-back-to-overview") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(query(root, "viewing-entry")).not.toBeNull();
    });
    expect(query(root, "viewing-tour-summary")!.textContent).toContain(
      "already visited",
    );
    expect(storage.getItem("tour:tour-castle")).not.toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "complete screen"
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "tour-complete screen"
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "not yet complete"
```
Expected: FAIL — `query(root, "viewing-tour-complete")` / `viewing-back-to-overview` are `null` (screen and buttons don't exist yet); the app currently always returns to `viewing-entry`.

- [ ] **Step 3: Add `mountTourCompleteScreen` to `screens.ts`**

Add this at the end of `src/app/viewing/screens.ts` (after `mountTourEntryScreen`'s closing `}`):

```ts

export interface TourCompleteScreenOptions {
  readonly waypointCount: number;
  /** Where the 2D map (component 7) is mounted — kept across screens. */
  readonly mapHost: HTMLElement;
  readonly onRestartTour: () => void;
  readonly onBackToOverview: () => void;
}

export function mountTourCompleteScreen(
  root: HTMLElement,
  options: TourCompleteScreenOptions,
): Screen {
  const element = panel("viewing-tour-complete");

  const title = heading("Tour complete!");
  const summary = paragraph(
    `You visited all ${options.waypointCount} stops.`,
    "muted",
  );

  const backToOverview = document.createElement("button");
  backToOverview.className = "primary";
  backToOverview.textContent = "Back to overview";
  backToOverview.dataset.testid = "viewing-back-to-overview";
  backToOverview.addEventListener("click", () => options.onBackToOverview());

  const restart = document.createElement("button");
  restart.textContent = "Restart tour";
  restart.dataset.testid = "viewing-restart";
  restart.addEventListener("click", () => options.onRestartTour());

  element.append(title, summary, options.mapHost, backToOverview, restart);
  root.appendChild(element);

  return {
    destroy() {
      // The map host is owned by the caller and outlives this screen.
      if (options.mapHost.parentElement === element) {
        options.mapHost.remove();
      }
      element.remove();
    },
  };
}
```

- [ ] **Step 4: Wire it into `viewing-app.ts`**

First, add `mountTourCompleteScreen` to the `screens.js` import. Find:

```ts
import {
  mountErrorScreen,
  mountLoadingScreen,
  mountTourEntryScreen,
  type Screen,
  type TourEntryScreen,
} from "./screens.js";
```

Replace with:

```ts
import {
  mountErrorScreen,
  mountLoadingScreen,
  mountTourCompleteScreen,
  mountTourEntryScreen,
  type Screen,
  type TourEntryScreen,
} from "./screens.js";
```

Next, find `restartTour`'s closing brace:

```ts
  function restartTour(): void {
    if (tour === null) return;
    clearProgress(tour.id, deps.progressStorage);
    store.dispatch(clearTour());
    store.dispatch(loadTour(tour));
    mountEntry();
    // mountEntry()'s ensureMap() is a no-op once `map` already exists (the
    // common case here — a restart never nulls it out), so without this the
    // map keeps showing the previous run's visited/next highlighting until
    // a full page reload re-creates everything from scratch.
    refreshMapMarkers();
  }
```

Add these three new functions directly after it (before the `// ── The AR session` section comment):

```ts

  function isTourComplete(): boolean {
    return (
      selectNextUnvisitedWaypoint(store.getState()) === null &&
      selectVisitedWaypointIds(store.getState()).length > 0
    );
  }

  function mountComplete(): void {
    if (tour === null) return;
    clearScreen();
    void acquireWakeLock();

    const complete = mountTourCompleteScreen(arHost, {
      waypointCount: tour.waypoints.length,
      mapHost,
      onRestartTour: () => restartTour(),
      onBackToOverview: () => mountEntry(),
    });
    screen = complete;

    // mapHost is now parented at its final layout position (inside
    // `complete`'s element) — only now does Leaflet's size measurement give
    // a real box.
    ensureMap();
    map?.show();
    map?.resize();
    mapVisible = true;
  }

  /** Where a session hands back to after it ends (VC13/VC25): the normal
   *  overview, unless the visitor has now visited every stop. */
  function returnToOverview(): void {
    if (isTourComplete()) mountComplete();
    else mountEntry();
  }
```

Then, inside `leavePreview()`, find:

```ts
    if (!destroyed) mountEntry();
```

(the one inside `function leavePreview(): void {`) and replace with:

```ts
    if (!destroyed) returnToOverview();
```

Then, inside `leaveAr()`, find the same line:

```ts
    if (!destroyed) mountEntry();
```

(the one inside `function leaveAr(reason: "user" | "external"): void {`) and replace with:

```ts
    if (!destroyed) returnToOverview();
```

**Note:** `restartTour()` itself keeps calling `mountEntry()` directly — right after clearing progress the tour is by definition not complete, so it must never route through `returnToOverview()`/`mountComplete()`. Likewise `mountComplete()`'s "Back to overview" button calls `mountEntry()` directly, not `returnToOverview()`, so it always shows the normal screen even though the tour is still complete.

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts
```
Expected: all tests pass, including the 4 new ones and every pre-existing test (the `leaveAr`/`leavePreview` change only changes behavior when `isTourComplete()` is true, which no pre-existing test's fixture data satisfies).

- [ ] **Step 6: Typecheck and lint**

Run:
```bash
pnpm run typecheck
pnpm run lint
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/viewing/screens.ts src/app/viewing/viewing-app.ts src/app/viewing/viewing-app.test.ts
git commit -m "feat(tourbuilder): add End-of-Tour screen, shown when every stop is visited

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Live in-session notice on completion

**Files:**
- Modify: `src/app/viewing/viewing-app.ts`
- Test: `src/app/viewing/viewing-app.test.ts`

**Interfaces:**
- Consumes: `isTourComplete()` (Task 2), `hud?.showNotice(message: string)` (Task 1's dismissible notice), `markWaypointVisited` from `../../store/tour-progress-slice.js` (new import, test file only).

- [ ] **Step 1: Write the failing test**

First, add the new import at the top of `src/app/viewing/viewing-app.test.ts`, alongside the existing store import:

```ts
import { TourLoadError } from "../../components/cloud-loader/core/errors.js";
```

Add directly after it:

```ts
import { markWaypointVisited } from "../../store/tour-progress-slice.js";
```

Then add this test right before the final `});`:

```ts
  it("shows a dismissible notice in the HUD the moment the last stop is visited mid-session", async () => {
    const storage = fakeStorage({
      "tour:tour-castle": '{"visited":["wp-gate"]}',
    });
    const { controller } = fakeController();
    const startArScene = vi.fn(
      (options: {
        store: { dispatch: (action: { type: string; payload?: unknown }) => void };
      }) => {
        queueMicrotask(() => {
          options.store.dispatch(markWaypointVisited("wp-tower"));
        });
        return { scene: {} as never, dispose: vi.fn() };
      },
    );

    mountViewingApp(root, "https://host.example/tour.zip", {
      ...testDeps({
        progressStorage: storage,
        startArScene: startArScene as unknown as ViewingAppDeps["startArScene"],
      }),
      createController: () => controller as never,
    });

    await vi.waitFor(() => {
      expect(query(root, "grant-access")).not.toBeNull();
    });
    await completeOnboarding(root);
    (query(root, "viewing-enter-ar") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const notice = query(root, "viewing-hud-notice");
      expect(notice).not.toBeNull();
      expect(notice!.hidden).toBe(false);
    });
    expect(query(root, "viewing-hud-notice")!.textContent).toContain(
      "every stop",
    );
    // Still in the AR session — nothing forced the visitor out.
    expect(query(root, "viewing-hud")).not.toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "dismissible notice in the HUD the moment"
```
Expected: FAIL — the `vi.waitFor` times out because the notice never shows (`subscribeProgress` doesn't yet check for completion).

- [ ] **Step 3: Implement the trigger in `subscribeProgress`**

In `src/app/viewing/viewing-app.ts`, find:

```ts
  /** VC14: persist as the walk progresses, not only at the end. */
  function subscribeProgress(): void {
    let lastVisited = selectVisitedWaypointIds(store.getState());
    unsubscribeProgress = store.subscribe(() => {
      const visited = selectVisitedWaypointIds(store.getState());
      if (visited === lastVisited || tour === null) return;
      lastVisited = visited;
      persistProgress(tour.id, [...visited], deps.progressStorage);
      refreshMapMarkers();
    });
  }
```

Replace with:

```ts
  /** VC14: persist as the walk progresses, not only at the end. */
  function subscribeProgress(): void {
    let lastVisited = selectVisitedWaypointIds(store.getState());
    let wasComplete = isTourComplete();
    unsubscribeProgress = store.subscribe(() => {
      const visited = selectVisitedWaypointIds(store.getState());
      if (visited === lastVisited || tour === null) return;
      lastVisited = visited;
      persistProgress(tour.id, [...visited], deps.progressStorage);
      refreshMapMarkers();

      const complete = isTourComplete();
      if (complete && !wasComplete) {
        hud?.showNotice(
          "That's every stop! Explore this one, then tap End Tour whenever you're ready.",
        );
      }
      wasComplete = complete;
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts -t "dismissible notice in the HUD the moment"
```
Expected: PASS

- [ ] **Step 5: Run the full test suite and quality gates**

Run:
```bash
pnpm exec vitest run src/app/viewing/viewing-app.test.ts
pnpm run typecheck
pnpm run lint
pnpm exec vitest run
```
Expected: every test passes (591+ existing tests plus the 6 added across this plan), typecheck clean, lint clean (only the pre-existing `no-console` warning in `pack-and-share-panel.ts`, unrelated to this work).

- [ ] **Step 6: Commit**

```bash
git add src/app/viewing/viewing-app.ts src/app/viewing/viewing-app.test.ts
git commit -m "feat(tourbuilder): notify the visitor in-session when the tour is complete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
