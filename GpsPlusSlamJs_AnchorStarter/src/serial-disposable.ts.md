# `serial-disposable.ts`

## Purpose

A **serial disposable** — a slot holding at most one `Disposable` that disposes
whatever it held before adopting a replacement. AnchorStarter uses it to keep
exactly one live `ArWorldGroupAlignment` binding across `startAr()` runs.

## Background

`enableArWorldGroupAlignment` (framework `visualization`) GPS-registers the AR
view: it registers a per-frame lerp update **and** a store subscription, both
bound to the `arWorldGroup` it was handed, and returns a disposable handle.

`startAr()` can run more than once: a failed boot routes through `failStart`,
which restores the start screen, and the user can tap "Start AR" again. Each run
builds a **fresh** store + arWorldGroup (the framework rebuilds the scene
hierarchy per session and nulls the old reference on teardown). Re-enabling
alignment without disposing the previous handle leaves the old per-frame
callback ticking forever against the now-detached group (wasted CPU, and it pins
the old group from GC). The framework delegates this to the caller
("Idempotency / double-drive is the caller's concern").

In AnchorStarter the `store` and the `enable` function (resolved through
`getSeams()`) are **session-scoped** — recreated inside each `startAr()` — so the
only thing that must persist across restarts is "the previous handle to
dispose". This generic slot is exactly that primitive.

> The MinimalExample uses an app-specific `createAlignmentBinding({ store,
enable })` instead, because there the store is created once up front and
> `enable` is a direct import, so it can capture both. AnchorStarter cannot —
> hence this lighter, dependency-free primitive.

## Public API

- `createSerialDisposable() → SerialDisposable`
  - `.set(next: Disposable)` — adopt `next`, disposing the previously held
    disposable **first**.
  - `.dispose()` — dispose the current disposable, if any; idempotent; a no-op
    before the first `set`.
- The held value is any `{ dispose(): void }` (the shape
  `ArWorldGroupAlignmentHandle` already satisfies) — an inline structural type,
  so callers need not import a named interface.

## Invariants & assumptions

- **Dispose-before-adopt:** `set` disposes the prior holder _before_ storing the
  next, so there is never a window with two live handles.
- At most one disposable is live at any time.
- `dispose()` is safe to call repeatedly and with nothing held.
- After `dispose()`, `set()` works again (no stale handle to release).

## Usage (`main.ts`)

```ts
const alignmentBinding = createSerialDisposable(); // module scope

// inside startAr(), per session (fresh store + arWorldGroup):
alignmentBinding.set(
  getSeams().enableArWorldGroupAlignment({ store, arWorldGroup }),
);

// failed boot / page unload:
alignmentBinding.dispose();
```

## Tests

`serial-disposable.test.ts` (headless, node env): first `set` adopts without
disposing; `set` disposes the previous handle exactly once; dispose happens
**before** adopting the next; `dispose()` idempotent; `dispose()` before any
`set` is a no-op; clean re-adopt after a dispose.
