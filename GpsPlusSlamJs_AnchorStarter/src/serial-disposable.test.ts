import { describe, expect, it, vi } from "vitest";

import { createSerialDisposable } from "./serial-disposable.js";

// Why this test matters:
// AnchorStarter wires the AR view to the store's alignment via
// `enableArWorldGroupAlignment`, which registers a per-frame lerp callback + a
// store subscription and returns a disposable handle. `startAr()` can run more
// than once (a failed boot resets the start screen, and the user can tap
// "Start AR" again), and each run builds a FRESH store + arWorldGroup. Without
// disposing the prior handle, the old per-frame callback keeps ticking forever
// against the detached old group (a leak + wasted CPU). This serial disposable
// is the primitive that holds the single live handle: `set()` disposes the
// previous one before adopting the next, and `dispose()` releases it on a failed
// boot / page unload. These tests lock that contract headlessly.

describe("createSerialDisposable", () => {
  it("adopts the first disposable without disposing anything", () => {
    const slot = createSerialDisposable();
    const dispose = vi.fn();

    slot.set({ dispose });

    expect(dispose).not.toHaveBeenCalled();
  });

  it("disposes the previous disposable when a new one is set", () => {
    const slot = createSerialDisposable();
    const first = vi.fn();
    const second = vi.fn();

    slot.set({ dispose: first });
    slot.set({ dispose: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("disposes the previous BEFORE adopting the next", () => {
    const slot = createSerialDisposable();
    const order: string[] = [];

    slot.set({ dispose: () => order.push("dispose-first") });
    // Adopting `second` must not happen until `first` is released, so there is
    // never a window with two live handles.
    order.push("set-second");
    slot.set({ dispose: () => order.push("dispose-second") });

    expect(order).toEqual(["set-second", "dispose-first"]);
  });

  it("dispose() releases the current disposable and is idempotent", () => {
    const slot = createSerialDisposable();
    const dispose = vi.fn();

    slot.set({ dispose });
    slot.dispose();
    slot.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("dispose() before any set is a no-op", () => {
    const slot = createSerialDisposable();

    expect(() => slot.dispose()).not.toThrow();
  });

  it("can adopt again cleanly after a dispose", () => {
    const slot = createSerialDisposable();
    const first = vi.fn();
    const second = vi.fn();

    slot.set({ dispose: first });
    slot.dispose();
    slot.set({ dispose: second });

    // The first was already released by dispose(), so adopting the second must
    // not dispose it again, and the second stays live.
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
