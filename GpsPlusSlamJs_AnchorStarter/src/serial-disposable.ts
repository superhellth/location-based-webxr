/**
 * A serial disposable — a slot holding at most one `Disposable`, which disposes
 * whatever it held before adopting a replacement.
 *
 * Why this exists: `enableArWorldGroupAlignment` GPS-registers the AR view by
 * registering a per-frame lerp callback + a store subscription, bound to the
 * specific `arWorldGroup` it was handed, and returns a disposable handle. In
 * AnchorStarter, `startAr()` can run more than once — a failed boot resets the
 * start screen and the user can tap "Start AR" again — and each run builds a
 * FRESH store + arWorldGroup (the framework rebuilds the scene hierarchy per
 * session and nulls the old reference on teardown). Re-enabling alignment
 * without disposing the previous handle leaves the old per-frame callback
 * ticking forever against the now-detached group (wasted CPU, and it pins the
 * old group from GC). The framework explicitly delegates this to the caller
 * ("Idempotency / double-drive is the caller's concern").
 *
 * AnchorStarter's store and `enable` (resolved through `getSeams()`) are both
 * session-scoped — recreated inside each `startAr()` — so the only thing that
 * must persist across restarts is "the previous handle to dispose". This
 * generic slot is exactly that primitive (the classic Rx "SerialDisposable"):
 * `set()` adopts the session's new handle and releases the prior one, and
 * `dispose()` releases the live handle on a failed boot / page unload. It is
 * dependency-free so the lifecycle is unit-testable without a device.
 *
 * (The MinimalExample uses an app-specific `createAlignmentBinding` instead,
 * because there the store is created once up front and `enable` is a direct
 * import — so it can capture both. AnchorStarter cannot, hence this primitive.)
 */

/**
 * The minimal shape this slot holds — structurally satisfied by the framework's
 * `ArWorldGroupAlignmentHandle`. Kept inline (not an exported named type) so the
 * primitive stays dependency-free and consumers just pass any `{ dispose() }`.
 */
type Disposable = { dispose(): void };

export interface SerialDisposable {
  /** Adopt `next`, disposing the previously held disposable first. */
  set(next: { dispose(): void }): void;
  /** Dispose the current disposable, if any (idempotent). */
  dispose(): void;
}

export function createSerialDisposable(): SerialDisposable {
  let current: Disposable | null = null;

  return {
    set(next: Disposable): void {
      // Dispose BEFORE adopting so there is never a window with two live
      // handles (e.g. two per-frame alignment callbacks driving the scene).
      current?.dispose();
      current = next;
    },
    dispose(): void {
      current?.dispose();
      current = null;
    },
  };
}
