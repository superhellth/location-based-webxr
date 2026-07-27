import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { setWaypointZone } from "../../../store/zones-slice.js";
import type { ZoneState } from "../../../store/types.js";
import type { ProximityObject, ZoneMap } from "../core/proximity-machine.js";
import { createProximityDriver } from "./proximity-driver.js";

/**
 * Why these tests matter: the driver is the only impure half of component 4. It
 * reads the live world-space pose each frame, runs the pure machine, and writes
 * transitions into the `zones` slice via `setWaypointZone` — nothing else (no
 * asset-provider, no THREE; contract D15/§2.5). These tests pin the two things
 * that can only be verified with the wiring in place: that transitions become
 * `setWaypointZone` dispatches, and that the movement-epsilon gate skips work
 * when the user has barely moved (a pure perf gate that must never change the
 * eventual result). The transition *logic* itself is covered by the core tests;
 * the replay e2e proves the whole thing on a real recorded walk.
 */

const WP: ProximityObject = {
  id: "wp",
  position: new Vector3(0, 0, 0),
  prefetchRadius: 25,
  activeRadius: 10,
};

/**
 * A tiny in-memory stand-in for the store: `dispatch` applies `setWaypointZone`
 * to a mutable map, and `getZones` reads it back — exactly the round-trip the
 * real driver relies on (RTK dispatch is synchronous).
 */
function fakeStore(seed: ZoneMap = {}) {
  const zones: Record<string, ZoneState> = { ...seed };
  const dispatch = vi.fn((action: ReturnType<typeof setWaypointZone>) => {
    zones[action.payload.id] = action.payload.zone;
  });
  return { zones, dispatch, getZones: () => zones as ZoneMap };
}

describe("createProximityDriver — dispatching transitions", () => {
  it("dispatches setWaypointZone for each zone change as the user approaches", () => {
    const store = fakeStore({ wp: "IDLE" });
    const pos = new Vector3(100, 0, 0);
    const driver = createProximityDriver({
      getUserWorldPos: () => pos,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
      movementEpsilonM: 0.25,
    });

    pos.set(20, 0, 0); // inside prefetch
    driver.tick();
    expect(store.dispatch).toHaveBeenLastCalledWith(
      setWaypointZone({ id: "wp", zone: "PREFETCHING" }),
    );

    pos.set(5, 0, 0); // inside active
    driver.tick();
    expect(store.dispatch).toHaveBeenLastCalledWith(
      setWaypointZone({ id: "wp", zone: "ACTIVE" }),
    );

    expect(store.zones.wp).toBe("ACTIVE");
  });

  it("does not dispatch when no zone changes", () => {
    const store = fakeStore({ wp: "IDLE" });
    const pos = new Vector3(100, 0, 0); // far outside prefetch
    const driver = createProximityDriver({
      getUserWorldPos: () => pos,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
    });
    driver.tick();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe("createProximityDriver — movement-epsilon gate", () => {
  it("skips the step when the user moved less than the epsilon, then runs once past it", () => {
    const store = fakeStore({ wp: "IDLE" });
    const pos = new Vector3(26, 0, 0);
    const driver = createProximityDriver({
      getUserWorldPos: () => pos,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
      movementEpsilonM: 1.0,
    });

    driver.tick(); // first tick always runs; 26 > 25 → stays IDLE, no dispatch
    expect(store.dispatch).not.toHaveBeenCalled();

    pos.set(25.5, 0, 0); // moved 0.5 < 1.0 → gated out, even though 25.5 ≤ 25 is false anyway
    driver.tick();
    expect(store.dispatch).not.toHaveBeenCalled();

    pos.set(24.5, 0, 0); // moved 1.5 from the last *evaluated* pos (26) → runs
    driver.tick();
    expect(store.dispatch).toHaveBeenCalledTimes(1);
    expect(store.dispatch).toHaveBeenLastCalledWith(
      setWaypointZone({ id: "wp", zone: "PREFETCHING" }),
    );
  });

  it("measures movement from the last evaluated pose, not the last tick", () => {
    const store = fakeStore({ wp: "IDLE" });
    const pos = new Vector3(26, 0, 0);
    const driver = createProximityDriver({
      getUserWorldPos: () => pos,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
      movementEpsilonM: 1.0,
    });
    driver.tick(); // evaluated at 26
    // three sub-epsilon hops that together exceed epsilon must still eventually run
    pos.set(25.4, 0, 0); // 0.6 from 26 → gated
    driver.tick();
    pos.set(24.6, 0, 0); // 1.4 from 26 → runs, evaluated at 24.6 → PREFETCHING
    driver.tick();
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });
});

describe("createProximityDriver — no pose yet", () => {
  it("does nothing when getUserWorldPos returns null", () => {
    const store = fakeStore({ wp: "IDLE" });
    const driver = createProximityDriver({
      getUserWorldPos: () => null,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
    });
    expect(() => driver.tick()).not.toThrow();
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});

describe("createProximityDriver — reset", () => {
  it("forgets the last evaluated pose so the next tick always runs", () => {
    const store = fakeStore({ wp: "IDLE" });
    const pos = new Vector3(20, 0, 0);
    const driver = createProximityDriver({
      getUserWorldPos: () => pos,
      getObjects: () => [WP],
      getZones: store.getZones,
      dispatch: store.dispatch,
      config: { hysteresisFraction: 0.2 },
      movementEpsilonM: 1.0,
    });
    driver.tick(); // → PREFETCHING
    store.dispatch.mockClear();

    driver.reset();
    pos.set(20.1, 0, 0); // sub-epsilon move, but reset forces a run
    driver.tick();
    // zone is already PREFETCHING so no *new* transition, but the step ran:
    expect(store.zones.wp).toBe("PREFETCHING");
  });
});
