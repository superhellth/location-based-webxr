# src/app — Goal-2 composition (Authoring mode)

The first half of Goal 2 (TASK.md §2.4): wires the ten individually-approved
components together through the shared store into a real, runnable app.
Composition code only — every component's own demo (`src/components/*/`)
stays untouched and independently runnable.

**This directory composes; it is never composed into.** `src/components/`
and `src/store/` must not import from here (enforced by
`config/.dependency-cruiser.cjs`'s `components-and-store-not-to-app` rule) —
dependencies flow `app → components`/`app → store` only.

## Run it

```bash
pnpm dev            # then open http://localhost:8185/src/app/
```

No `?tour=` → Authoring mode (real, complete). `?tour=<anything>` → a
placeholder screen; Viewing mode's real composition is a separate,
later plan.

## Layout

| Path                     | What lives here                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| `main.ts` / `index.html` | The entry. Reads `?tour=` once via `mode.ts` and mounts the matching flow. |
| `mode.ts`                | Pure `resolveAppMode(url)` — the only mode-decision logic (contract D13).  |
| `viewing-placeholder.ts` | Temporary stand-in for Viewing mode.                                       |
| `authoring/`             | The real, composed Authoring flow — see below.                             |

### `authoring/`

| Path                         | What lives here                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `authoring-app.ts`           | Sequences the screens: onboarding gate (9) → resume-draft prompt (AC10) → authoring tools (10, live GPS only) → pack-and-share.                                                      |
| `pack-and-share-panel.ts`    | New, small, own-UI panel built from packaging's (5) `core/`/`view/` functions — not a reuse of that component's own demo UI.                                                         |
| `restore-authoring-draft.ts` | Durable draft persistence: writes `authoring/*` actions to OPFS directly (bypassing `OpfsStorageBackend`/the `recording` slice — see below), replays them back after a crash/reload. |
| `wake-lock.ts`               | Screen Wake Lock during an active session. Feature-detected, non-fatal no-op when unsupported.                                                                                       |
| `unload-guard.ts`            | `beforeunload` warning while the draft is non-empty and unexported.                                                                                                                  |

## Data flow (Authoring mode)

```
mountOnboardingGate ──onComplete──▶ findResumableDraft()
                                      │
                    ┌── found ────────┴──── not found ──┐
                    ▼                                    ▼
        resume/discard prompt                  beginDurableAuthoringSession()
                    │                                    │
        resume: restoreAuthoringDraft(plain dispatch)     │
                    └──────────────────┬────────────────┘
                                       ▼
                    createAuthoringStore() + durable.wrapDispatch(store.dispatch)
                                       │
              mountAuthoringView / createAuthoringSession (live GPS, real map)
                                       │
                                  session.exportTour()
                                       │
                          mountPackAndSharePanel → packTour → downloadBlob
                                                            → paste hosted URL → QR
```

## Why draft durability bypasses `OpfsStorageBackend`

`OpfsStorageBackend` only persists while `state.recording.isRecording` is
true — turning that on would require dispatching the framework's
`startSession`/`endSession` (the `recording` slice), which would _also_
start writing every other whitelisted framework action (e.g. raw `gpsData`
GPS-fix events) to OPFS for the whole session — a telemetry side effect
unrelated to "keep my waypoint draft safe." `restore-authoring-draft.ts`
instead calls the same low-level primitives `OpfsStorageBackend` itself
calls (`initOpfsStorage`, `createSession`, `writeAction`, `listSessions`,
`getSessionsRootHandle`, `setSessionHandles`), scoped to exactly the
`authoring/*` actions this feature cares about. See
`plans/2026-08-14-authoring-composition-plan.md` (AC10) for the full
decision record.

## Tests

`mode.test.ts`, `viewing-placeholder.test.ts`, `authoring/unload-guard.test.ts`,
`authoring/wake-lock.test.ts`, `authoring/restore-authoring-draft.test.ts` —
unit tests for each pure/isolable piece. `authoring/authoring-app.test.ts` is
the **composed-flow test** (TASK.md §2.4): real onboarding gate, real
`createAuthoringStore`, real authoring session/view, real `packTour` — only
the framework's four permission functions (+ the GPS watch living in the
same module) and `AudioContext` are mocked. It proves the pieces are
actually wired together (not just individually correct), asserts the packed
`tour.zip` is store-mode (never DEFLATE) and passes `validateTour`, and
covers the negative path (a denied permission never reaches the authoring
tools screen). Run `pnpm test:unit`.

## Plan

[`plans/2026-08-14-authoring-composition-plan.md`](../../plans/2026-08-14-authoring-composition-plan.md)
· contract: [`plans/Shared-Contract.md`](../../plans/Shared-Contract.md).
