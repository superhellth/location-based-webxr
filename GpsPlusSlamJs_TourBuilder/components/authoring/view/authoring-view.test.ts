/**
 * `mountAuthoringView` DOM wiring tests. jsdom — the session and the store
 * subscription are both injected, so no real GPS/Redux is involved.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  mountAuthoringView,
  type AuthoringViewDeps,
} from "./authoring-view.js";
import type { AuthoringSliceState } from "../../../store/authoring-slice.js";
import type { AssetSlot } from "../core/asset-attachment.js";

function draft(
  overrides: Partial<AuthoringSliceState> = {},
): AuthoringSliceState {
  return {
    name: "",
    description: "",
    assets: [],
    waypoints: [],
    breadcrumb: [],
    ...overrides,
  };
}

/** A minimal hand-rolled store: plain state + listeners, no Redux dependency. */
function fakeStore(initial: AuthoringSliceState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const actions: unknown[] = [];
  return {
    getState: () => ({ authoring: state }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action: { type: string; payload: unknown }) => {
      actions.push(action);
    },
    setState: (next: AuthoringSliceState) => {
      state = next;
      for (const l of listeners) l();
    },
    actions,
  };
}

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

function byTestId(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid=${id}]`);
  return el as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountAuthoringView", () => {
  it("renders one row per waypoint in state", () => {
    const { root } = harness(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
          {
            id: "wp-2",
            position: { lat: 3, lon: 4 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );
    expect(root.querySelectorAll('[data-testid^="waypoint-"]')).toHaveLength(2);
  });

  it("re-renders when the store notifies a state change", () => {
    const { root, store } = harness();
    expect(root.querySelectorAll('[data-testid^="waypoint-"]')).toHaveLength(0);

    store.setState(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );

    expect(root.querySelectorAll('[data-testid^="waypoint-"]')).toHaveLength(1);
  });

  it("Drop Waypoint button calls session.dropWaypoint()", () => {
    const { root, session } = harness();
    byTestId(root, "drop-waypoint").click();
    expect(session.dropWaypoint).toHaveBeenCalledTimes(1);
  });

  it("editing a waypoint's prefetch radius dispatches updateWaypoint", () => {
    const { root, store } = harness(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );
    const input = byTestId(root, "prefetch-radius-wp-1") as HTMLInputElement;
    input.value = "30";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.actions).toContainEqual({
      type: "authoring/updateWaypoint",
      payload: { id: "wp-1", changes: { prefetchRadius: 30 } },
    });
  });

  it("editing a waypoint's active radius dispatches updateWaypoint", () => {
    const { root, store } = harness(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );
    const input = byTestId(root, "active-radius-wp-1") as HTMLInputElement;
    input.value = "12";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.actions).toContainEqual({
      type: "authoring/updateWaypoint",
      payload: { id: "wp-1", changes: { activeRadius: 12 } },
    });
  });

  it("the remove button dispatches removeWaypoint(id)", () => {
    const { root, store } = harness(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );
    byTestId(root, "remove-waypoint-wp-1").click();

    expect(store.actions).toContainEqual({
      type: "authoring/removeWaypoint",
      payload: "wp-1",
    });
  });

  it("picking a file for a slot calls session.attachAsset(waypointId, slot, file)", () => {
    const { root, session } = harness(
      draft({
        waypoints: [
          {
            id: "wp-1",
            position: { lat: 1, lon: 2 },
            prefetchRadius: 25,
            activeRadius: 10,
            content: {},
          },
        ],
      }),
    );
    const input = byTestId(root, "asset-model-wp-1") as HTMLInputElement;
    const file = new File(["x"], "knight.glb");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const slot: AssetSlot = "model";
    expect(session.attachAsset).toHaveBeenCalledWith("wp-1", slot, file);
  });

  it("name/description inputs dispatch setTourMeta", () => {
    const { root, store } = harness();
    const nameInput = byTestId(root, "tour-name") as HTMLInputElement;
    nameInput.value = "Castle Walk";
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.actions).toContainEqual({
      type: "authoring/setTourMeta",
      payload: { name: "Castle Walk", description: "" },
    });
  });

  it("Export button calls session.exportTour() and forwards the result to onExport", () => {
    const { root, session, onExport } = harness();
    byTestId(root, "export").click();

    expect(session.exportTour).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith({
      tour: { id: "t" },
      assetFiles: new Map(),
    });
  });

  it("destroy() unsubscribes from the store and clears the DOM", () => {
    const { root, store, view } = harness();
    view.destroy();

    expect(root.innerHTML).toBe("");
    store.setState(draft({ name: "should not re-render" }));
    expect(root.innerHTML).toBe("");
  });
});
