/**
 * `mountAuthoringView` — the DOM wiring for component 10. Renders tour
 * meta inputs, the waypoint list as labeled cards (radius inputs, per-slot
 * file inputs with their attached filename read from state, remove), a
 * Drop Waypoint button, and an Export button. Reacts to store changes via
 * an injected `subscribe`/`getState` pair rather than owning state itself —
 * the `authoring` slice (already built by component 3) is the single
 * source of truth.
 *
 * @see plans/2026-08-07-authoring-plan.md
 * @see plans/2026-08-07-authoring-demo-ux-plan.md (card layout, U5/U6)
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

const ASSET_SLOT_LABEL: Record<AssetSlot, string> = {
  model: "Model (.glb/.gltf)",
  sprite: "Sprite (image)",
  audio: "Audio (.mp3/.ogg)",
};
const ASSET_SLOTS: readonly AssetSlot[] = ["model", "sprite", "audio"];

function labeledField(
  labelText: string,
  input: HTMLElement,
  testid: string,
): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.dataset.testid = `field-${testid}`;
  const span = document.createElement("span");
  span.textContent = labelText;
  wrapper.append(span, input);
  return wrapper;
}

export function mountAuthoringView(
  root: HTMLElement,
  deps: AuthoringViewDeps,
): AuthoringView {
  let destroyed = false;

  /** The attached filename for a slot, read from state — never from a
   *  native <input>'s own "chosen file" label, which resets on every
   *  re-render (U5). "(none)" when nothing is attached. */
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

  function renderWaypointCard(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    index: number,
  ): HTMLElement {
    const card = document.createElement("div");
    card.className = "waypoint-card";
    card.dataset.testid = `waypoint-${wp.id}`;

    const header = document.createElement("div");
    header.className = "waypoint-card-header";
    const title = document.createElement("h3");
    title.textContent = `Waypoint ${index + 1}`;
    const badge = document.createElement("span");
    badge.className = "id-badge";
    badge.textContent = wp.id;
    const removeButton = document.createElement("button");
    removeButton.dataset.testid = `remove-waypoint-${wp.id}`;
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      deps.dispatch(removeWaypoint(wp.id));
    });
    header.append(title, badge, removeButton);
    card.append(header);

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
    card.append(
      labeledField("Prefetch radius (m)", prefetchInput, `prefetch-${wp.id}`),
    );

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
    card.append(
      labeledField("Active radius (m)", activeInput, `active-${wp.id}`),
    );

    for (const slot of ASSET_SLOTS) {
      const row = document.createElement("div");
      row.className = "asset-row";

      const fileLabel = document.createElement("label");
      const fileLabelText = document.createElement("span");
      fileLabelText.textContent = ASSET_SLOT_LABEL[slot];
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.dataset.testid = `asset-${slot}-${wp.id}`;
      fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (file) deps.session.attachAsset(wp.id, slot, file);
      });
      fileLabel.append(fileLabelText, fileInput);

      const status = document.createElement("span");
      status.className = "asset-status";
      status.dataset.testid = `asset-status-${slot}-${wp.id}`;
      status.textContent = attachedFilename(authoring, wp, slot);

      row.append(fileLabel, status);
      card.append(row);
    }

    return card;
  }

  function renderWaypointsSection(authoring: AuthoringSliceState): HTMLElement {
    const section = document.createElement("section");
    section.className = "authoring-section";

    const heading = document.createElement("h2");
    heading.textContent = "Waypoints";
    section.append(heading);

    const dropButton = document.createElement("button");
    dropButton.className = "primary";
    dropButton.dataset.testid = "drop-waypoint";
    dropButton.textContent = "+ Drop Waypoint";
    dropButton.addEventListener("click", () => {
      deps.session.dropWaypoint();
    });
    section.append(dropButton);

    if (authoring.waypoints.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.dataset.testid = "waypoints-empty";
      empty.textContent = "No waypoints yet — drop one to get started.";
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
    section.append(labeledField("Name", nameInput, "tour-name"));

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
    section.append(
      labeledField("Description", descriptionInput, "tour-description"),
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
    exportButton.dataset.testid = "export";
    exportButton.textContent = "Export & Pack";
    exportButton.addEventListener("click", () => {
      deps.onExport(deps.session.exportTour());
    });
    section.append(exportButton);

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
