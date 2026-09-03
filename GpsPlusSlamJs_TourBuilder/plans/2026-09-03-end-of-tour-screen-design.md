# End-of-Tour screen — design

Date: 2026-09-03
Status: approved (brainstormed with the user in-session)

## Problem

Right now, ending a viewing session — tapping "End Tour" in the HUD, the
Android back gesture, or leaving the desktop preview — always drops the
visitor back on the same tour-overview screen (`viewing-entry`), regardless
of whether they've visited one stop or all of them. There is no distinct
"you're done" moment, even when every waypoint has been visited.

## Goal

Give the visitor a clear, celebratory end-of-tour moment once they've
visited every waypoint — without ever abruptly interrupting them while
they're still engaging with the last stop's content in AR/preview.

## Trigger

`selectNextUnvisitedWaypoint(state)` (`src/store/selectors.ts`) already
returns `null` once every waypoint is visited — this is the "tour complete"
signal, reused as-is rather than adding a new selector.

Detection happens in `subscribeProgress()` (`viewing-app.ts`): alongside the
existing visited-ids tracking, track the previous "all visited" boolean and
fire the in-session notice once, on the `false → true` transition — never on
later store ticks (e.g. a later `updateWaypoint`-driven re-render).

The end screen itself is gated the same way at session-end time (see
"Wiring" below), not by a stored flag, so it stays correct even if the visit
state changed between the notice firing and the session actually ending.

## Two-stage UX (why, not just a screen)

Kicking the visitor straight out of AR the instant the last waypoint
activates would cut them off mid-experience — they haven't necessarily seen
or heard that stop's content yet. So completion is split into two stages:

1. **In-session notice** (non-blocking): a small dismissible banner appears
   in the HUD the moment the last waypoint activates. The visitor keeps
   walking, looking around, and experiencing the last stop exactly as
   before — nothing about the AR/preview session changes.
2. **End-of-Tour screen** (full screen): only shown once the visitor
   actually ends the session on their own terms.

## Changes

### `hud.ts` — dismissible notice

`showNotice()` currently has no dismiss affordance (used today for one-shot
messages like "Click the scene once to allow this story to play."). Add a
small ✕ close button to the existing notice element (CSS-only addition, no
new component) so a notice can be dismissed without disturbing the scene
underneath. Existing callers are unaffected — the button just gives the
visitor a way to hide the banner before it would naturally be replaced by
another message.

On the visited-transition, `viewing-app.ts` calls:
```
hud.showNotice("That's every stop! Explore this one, then tap End Tour whenever you're ready.");
```

### `screens.ts` — `mountTourCompleteScreen`

A new screen, structurally a sibling of `mountTourEntryScreen` (same
`panel()` builder, same `mapHost` re-parenting pattern so the map survives
the screen swap):

- Title: "Tour complete!"
- Stats line: "You visited all N stops" (testid `viewing-tour-complete`,
  panel testid so tests can assert this screen is showing)
- **Restart tour** button — reuses the existing `restartTour()` flow
  (clears progress, reloads the tour, returns to the entry screen fresh)
- **Back to overview** button — returns to the normal `mountEntry()` screen
  without resetting progress (visited state stays intact)

### `viewing-app.ts` — wiring

`leaveAr()` and `leavePreview()` currently always call `mountEntry()`.
Both instead check, at the moment the session ends:

```
selectNextUnvisitedWaypoint(store.getState()) === null && visitedCount > 0
```

(the `visitedCount > 0` guard so a zero-waypoint tour, where "next unvisited"
is trivially `null`, never mounts the complete screen) — if true, mount
`mountTourCompleteScreen` instead of the entry screen.

## Out of scope

- No auto-timer / auto-navigation away from the last waypoint.
- No change to how zones/waypoints activate or to the proximity state
  machine — this is purely a viewing-app composition + screens change.
- No persistence of "has the visitor already seen the complete screen" —
  it's derived fresh from visited state every time a session ends, so it
  naturally reappears if they restart and finish again.

## Testing

Unit tests in `viewing-app.test.ts` (existing jsdom harness, `fakeMap`/
`fakeController`/`testDeps` patterns already in the file):

- Visiting the last waypoint then ending the session shows
  `viewing-tour-complete` instead of `viewing-entry`.
- The in-session notice appears once the last waypoint is visited, and its
  ✕ button dismisses it without ending the session.
- **Restart tour** on the complete screen clears progress and returns to a
  fresh entry screen (mirrors the existing "clears stored progress on
  Restart tour" test).
- **Back to overview** returns to the normal entry screen with visited
  state intact (no progress cleared).
- Ending a session with an incomplete tour still shows the regular entry
  screen, unchanged from today.
