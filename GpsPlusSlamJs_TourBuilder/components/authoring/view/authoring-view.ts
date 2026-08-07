/**
 * `mountAuthoringView` — the DOM wiring for component 10. Renders tour
 * meta inputs, the waypoint list (radius inputs, per-slot file inputs,
 * remove), a Drop Waypoint button, and an Export button. Reacts to store
 * changes via an injected `subscribe`/`getState` pair rather than owning
 * state itself — the `authoring` slice (already built by component 3) is
 * the single source of truth.
 *
 * @see plans/2026-08-07-authoring-plan.md
 */

import {
  setTourMeta,
  updateWaypoint,
  removeWaypoint,
  type AuthoringSliceState,
} from "../../../store/authoring-slice.js";
import type { AuthoringStateShape } from "../../../store/selectors.js";
import type { AssetSlot } from "../core/asset-attachment.js";
import type { AssetId, Tour } from "../../../store/types.js";

type AuthoringViewAction =
  | ReturnType<typeof setTourMeta>
  | ReturnType<typeof updateWaypoint>
  | ReturnType<typeof removeWaypoint>;

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
  readonly onExport: (result: {
    tour: Tour;
    assetFiles: ReadonlyMap<AssetId, File>;
  }) => void;
}

export interface AuthoringView {
  readonly destroy: () => void;
}

const ASSET_SLOTS: readonly AssetSlot[] = ["model", "sprite", "audio"];

export function mountAuthoringView(
  root: HTMLElement,
  deps: AuthoringViewDeps,
): AuthoringView {
  let destroyed = false;

  function renderWaypointRow(
    wp: AuthoringSliceState["waypoints"][number],
  ): HTMLElement {
    const row = document.createElement("div");
    row.dataset.testid = `waypoint-${wp.id}`;

    const label = document.createElement("span");
    label.textContent = wp.id;
    row.append(label);

    const prefetchInput = document.createElement("input");
    prefetchInput.type = "number";
    prefetchInput.dataset.testid = `prefetch-radius-${wp.id}`;
    prefetchInput.value = String(wp.prefetchRadius);
    prefetchInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { prefetchRadius: Number(prefetchInput.value) },
        }),
      );
    });
    row.append(prefetchInput);

    const activeInput = document.createElement("input");
    activeInput.type = "number";
    activeInput.dataset.testid = `active-radius-${wp.id}`;
    activeInput.value = String(wp.activeRadius);
    activeInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { activeRadius: Number(activeInput.value) },
        }),
      );
    });
    row.append(activeInput);

    for (const slot of ASSET_SLOTS) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.dataset.testid = `asset-${slot}-${wp.id}`;
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) deps.session.attachAsset(wp.id, slot, file);
      });
      row.append(fileInput);
    }

    const removeButton = document.createElement("button");
    removeButton.dataset.testid = `remove-waypoint-${wp.id}`;
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      deps.dispatch(removeWaypoint(wp.id));
    });
    row.append(removeButton);

    return row;
  }

  function render(): void {
    const authoring = deps.getState().authoring;
    root.innerHTML = "";

    const nameInput = document.createElement("input");
    nameInput.dataset.testid = "tour-name";
    nameInput.value = authoring.name;
    nameInput.addEventListener("change", () => {
      deps.dispatch(
        setTourMeta({
          name: nameInput.value,
          description: authoring.description,
        }),
      );
    });
    root.append(nameInput);

    const descriptionInput = document.createElement("input");
    descriptionInput.dataset.testid = "tour-description";
    descriptionInput.value = authoring.description;
    descriptionInput.addEventListener("change", () => {
      deps.dispatch(
        setTourMeta({
          name: authoring.name,
          description: descriptionInput.value,
        }),
      );
    });
    root.append(descriptionInput);

    const waypointList = document.createElement("div");
    for (const wp of authoring.waypoints) {
      waypointList.append(renderWaypointRow(wp));
    }
    root.append(waypointList);

    const dropButton = document.createElement("button");
    dropButton.dataset.testid = "drop-waypoint";
    dropButton.textContent = "Drop Waypoint";
    dropButton.addEventListener("click", () => {
      deps.session.dropWaypoint();
    });
    root.append(dropButton);

    const exportButton = document.createElement("button");
    exportButton.dataset.testid = "export";
    exportButton.textContent = "Export";
    exportButton.addEventListener("click", () => {
      deps.onExport(deps.session.exportTour());
    });
    root.append(exportButton);
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
