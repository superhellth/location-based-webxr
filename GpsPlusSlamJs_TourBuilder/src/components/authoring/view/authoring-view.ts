/**
 * `mountAuthoringView` — the DOM wiring for component 10. Renders tour
 * meta inputs, the waypoint list as collapsible cards (radius inputs with
 * hint tooltips, a Model/Picture tile pair, an audio tile, a transcript
 * textarea), a Drop Waypoint button, and an Export button that packs,
 * downloads, and only then hands off to the injected `onExport`. Reacts to
 * store changes via an injected `subscribe`/`getState` pair rather than
 * owning state itself — the `authoring` slice (already built by component 3)
 * is the single source of truth for everything except which waypoint card is
 * expanded, which is local UI state (see the `expandedId` closure variable
 * below) so it survives unrelated re-renders without ever touching Redux.
 *
 * @see plans/2026-08-07-authoring-plan.md
 * @see plans/2026-08-07-authoring-demo-ux-plan.md (card layout, U5/U6)
 * @see plans/2026-09-02-authoring-composition-ui-refresh-design.md
 */

import {
  setTourMeta,
  updateWaypoint,
  removeWaypoint,
  removeAsset,
  type AuthoringSliceState,
} from "../../../store/authoring-slice.js";
import type { AuthoringStateShape } from "../../../store/selectors.js";
import {
  ALLOWED_EXTENSIONS,
  isAllowedAssetFile,
  type AssetSlot,
} from "../core/asset-attachment.js";
import type { AssetId, Tour } from "../../../store/types.js";
import { ICONS } from "../../shared/icons.js";
import { buildLabeledField } from "../../shared/labeled-field.js";

type AuthoringViewAction =
  | ReturnType<typeof setTourMeta>
  | ReturnType<typeof updateWaypoint>
  | ReturnType<typeof removeWaypoint>
  | ReturnType<typeof removeAsset>;

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
  /** Packs the tour and starts the download. Rejecting leaves the author on
   *  this screen with the error shown inline — nothing is torn down. */
  readonly packAndDownload: (
    tour: Tour,
    assetFiles: ReadonlyMap<AssetId, File>,
  ) => Promise<void>;
  /** Fires once `packAndDownload` has resolved successfully. */
  readonly onExport: (result: {
    tour: Tour;
    assetFiles: ReadonlyMap<AssetId, File>;
  }) => void;
}

export interface AuthoringView {
  readonly destroy: () => void;
}

const PREFETCH_HINT =
  "Distance at which this waypoint's media starts downloading, so it's ready before the visitor arrives.";
const ACTIVE_HINT =
  "Distance at which this waypoint's content actually plays. Must be smaller than the prefetch distance.";

const ACCEPT: Record<AssetSlot, string> = {
  model: ALLOWED_EXTENSIONS.model.join(","),
  sprite: ALLOWED_EXTENSIONS.sprite.join(","),
  audio: ALLOWED_EXTENSIONS.audio.join(","),
};

const SLOT_NOUN: Record<AssetSlot, string> = {
  model: "model",
  sprite: "picture",
  audio: "audio",
};

function formatAllowedExtensions(slot: AssetSlot): string {
  const exts = ALLOWED_EXTENSIONS[slot];
  return exts.length === 1
    ? exts[0]!
    : `${exts.slice(0, -1).join(", ")} or ${exts.at(-1)}`;
}

function rejectionMessage(slot: AssetSlot, file: File): string {
  return `${file.name} isn't a supported ${SLOT_NOUN[slot]} file. Use ${formatAllowedExtensions(slot)}.`;
}

export function mountAuthoringView(
  root: HTMLElement,
  deps: AuthoringViewDeps,
): AuthoringView {
  /** Which waypoint card is expanded (accordion: at most one at a time).
   *  Local UI state, deliberately never dispatched — a store round trip on
   *  every collapse/expand would defeat the whole point of keeping it
   *  independent from unrelated store updates. */
  let expandedId: string | null = null;

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

  function buildVisualTile(
    slot: Extract<AssetSlot, "model" | "sprite">,
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    errorEl: HTMLElement,
  ): HTMLElement {
    const assetId = wp.content[slot];
    const active = assetId !== undefined;

    const tile = document.createElement("label");
    tile.className = `visual-tile${active ? " visual-tile-active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "visual-tile-icon";
    icon.innerHTML = slot === "model" ? ICONS.cube : ICONS.photo;

    const label = document.createElement("span");
    label.className = "visual-tile-label";
    label.textContent = slot === "model" ? "Model" : "Picture";

    const status = document.createElement("span");
    status.className = "visual-tile-status";
    status.dataset["testid"] = `asset-status-${slot}-${wp.id}`;
    status.textContent = attachedFilename(authoring, wp, slot);

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ACCEPT[slot];
    fileInput.className = "visual-tile-input";
    fileInput.dataset["testid"] = `asset-${slot}-${wp.id}`;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!isAllowedAssetFile(slot, file)) {
        errorEl.textContent = rejectionMessage(slot, file);
        fileInput.value = "";
        return;
      }
      errorEl.textContent = "";
      deps.session.attachAsset(wp.id, slot, file);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "visual-tile-clear";
    clear.dataset["testid"] = `clear-${slot}-${wp.id}`;
    clear.innerHTML = ICONS.x;
    clear.addEventListener("click", (event) => {
      event.preventDefault(); // don't let the <label> forward the click into the file input
      if (assetId) deps.dispatch(removeAsset(assetId));
    });

    tile.append(icon, label, status, fileInput, clear);
    return tile;
  }

  function buildAudioTile(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    errorEl: HTMLElement,
  ): HTMLElement {
    const assetId = wp.content.audio;
    const active = assetId !== undefined;

    const tile = document.createElement("label");
    tile.className = `audio-tile${active ? " audio-tile-active" : ""}`;

    const icon = document.createElement("span");
    icon.className = "audio-tile-icon";
    icon.innerHTML = ICONS.audio;

    const label = document.createElement("span");
    label.className = "audio-tile-label";
    label.textContent = "Audio narration";

    const status = document.createElement("span");
    status.className = "audio-tile-status";
    status.dataset["testid"] = "asset-status-audio-" + wp.id;
    status.textContent = attachedFilename(authoring, wp, "audio");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ACCEPT.audio;
    fileInput.className = "audio-tile-input";
    fileInput.dataset["testid"] = `asset-audio-${wp.id}`;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!isAllowedAssetFile("audio", file)) {
        errorEl.textContent = rejectionMessage("audio", file);
        fileInput.value = "";
        return;
      }
      errorEl.textContent = "";
      deps.session.attachAsset(wp.id, "audio", file);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "audio-tile-clear";
    clear.dataset["testid"] = `clear-audio-${wp.id}`;
    clear.innerHTML = ICONS.x;
    clear.addEventListener("click", (event) => {
      event.preventDefault();
      if (assetId) deps.dispatch(removeAsset(assetId));
    });

    tile.append(icon, label, status, fileInput, clear);
    return tile;
  }

  /** One icon per attached content type, in the collapsed header. Trimmed so
   *  a whitespace-only transcript doesn't count as "written". */
  function buildSummary(
    wp: AuthoringSliceState["waypoints"][number],
  ): HTMLElement {
    const summary = document.createElement("span");
    summary.className = "wp-summary";

    const visualIcon =
      wp.content.model !== undefined
        ? ICONS.cube
        : wp.content.sprite !== undefined
          ? ICONS.photo
          : null;
    const hasAudio = wp.content.audio !== undefined;
    const hasTranscript = (wp.content.transcript ?? "").trim().length > 0;

    if (visualIcon === null && !hasAudio && !hasTranscript) {
      const empty = document.createElement("span");
      empty.className = "wp-summary-empty";
      empty.textContent = "empty";
      summary.append(empty);
      return summary;
    }

    if (visualIcon !== null) {
      const span = document.createElement("span");
      span.innerHTML = visualIcon;
      summary.append(span);
    }
    if (hasAudio) {
      const span = document.createElement("span");
      span.innerHTML = ICONS.audio;
      summary.append(span);
    }
    if (hasTranscript) {
      const span = document.createElement("span");
      span.innerHTML = ICONS.text;
      summary.append(span);
    }
    return summary;
  }

  function renderWaypointCard(
    authoring: AuthoringSliceState,
    wp: AuthoringSliceState["waypoints"][number],
    index: number,
  ): HTMLElement {
    const isOpen = wp.id === expandedId;

    const card = document.createElement("div");
    card.className = `waypoint-card${isOpen ? " open" : ""}`;
    card.dataset["testid"] = `waypoint-${wp.id}`;

    const header = document.createElement("div");
    header.className = "wp-header";
    header.dataset["testid"] = `wp-toggle-${wp.id}`;
    header.addEventListener("click", () => {
      expandedId = isOpen ? null : wp.id;
      render();
    });

    const chevron = document.createElement("span");
    chevron.className = "wp-chevron";
    chevron.innerHTML = ICONS.chevron;

    const title = document.createElement("h3");
    title.textContent = `Waypoint ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "icon-btn";
    removeButton.dataset["testid"] = `remove-waypoint-${wp.id}`;
    removeButton.setAttribute("aria-label", "Remove waypoint");
    removeButton.innerHTML = ICONS.x;
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation(); // don't also toggle the accordion
      deps.dispatch(removeWaypoint(wp.id));
    });

    header.append(chevron, title, buildSummary(wp), removeButton);
    card.append(header);

    const body = document.createElement("div");
    body.className = "wp-body";
    const bodyIn = document.createElement("div");
    bodyIn.className = "wp-body-in";
    body.append(bodyIn);
    card.append(body);

    const prefetchInput = document.createElement("input");
    prefetchInput.type = "number";
    prefetchInput.dataset["testid"] = `prefetch-radius-${wp.id}`;
    prefetchInput.value = String(wp.prefetchRadius);
    prefetchInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { prefetchRadius: Number(prefetchInput.value) },
        }),
      );
    });

    const activeInput = document.createElement("input");
    activeInput.type = "number";
    activeInput.dataset["testid"] = `active-radius-${wp.id}`;
    activeInput.value = String(wp.activeRadius);
    activeInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { activeRadius: Number(activeInput.value) },
        }),
      );
    });

    const radiusRow = document.createElement("div");
    radiusRow.className = "radius-row";
    radiusRow.append(
      buildLabeledField(
        "Prefetch (m)",
        prefetchInput,
        `prefetch-${wp.id}`,
        PREFETCH_HINT,
      ),
      buildLabeledField(
        "Active (m)",
        activeInput,
        `active-${wp.id}`,
        ACTIVE_HINT,
      ),
    );
    bodyIn.append(radiusRow);

    const visualLabel = document.createElement("p");
    visualLabel.className = "section-label";
    visualLabel.textContent = "Visual";
    bodyIn.append(visualLabel);

    const visualError = document.createElement("p");
    visualError.className = "field-error-text";
    visualError.dataset["testid"] = `visual-error-${wp.id}`;

    const tiles = document.createElement("div");
    tiles.className = "visual-tiles";
    tiles.append(
      buildVisualTile("model", authoring, wp, visualError),
      buildVisualTile("sprite", authoring, wp, visualError),
    );
    bodyIn.append(tiles, visualError);

    const hint = document.createElement("p");
    hint.className = "visual-hint";
    hint.textContent =
      "Choose a model or a picture for this waypoint. Attaching one clears the other.";
    bodyIn.append(hint);

    const audioError = document.createElement("p");
    audioError.className = "field-error-text";
    audioError.dataset["testid"] = `audio-error-${wp.id}`;

    const audioLabel = document.createElement("p");
    audioLabel.className = "section-label";
    audioLabel.textContent = "Audio";
    bodyIn.append(
      audioLabel,
      buildAudioTile(authoring, wp, audioError),
      audioError,
    );

    const transcriptInput = document.createElement("textarea");
    transcriptInput.dataset["testid"] = `transcript-${wp.id}`;
    transcriptInput.value = wp.content.transcript ?? "";
    transcriptInput.addEventListener("change", () => {
      deps.dispatch(
        updateWaypoint({
          id: wp.id,
          changes: { content: { transcript: transcriptInput.value } },
        }),
      );
    });
    bodyIn.append(
      buildLabeledField("Transcript", transcriptInput, `transcript-${wp.id}`),
    );

    return card;
  }

  function renderWaypointsSection(authoring: AuthoringSliceState): HTMLElement {
    const section = document.createElement("section");
    section.className = "authoring-section";

    const heading = document.createElement("div");
    heading.className = "waypoints-heading";
    const h2 = document.createElement("h2");
    h2.textContent = `Waypoints · ${authoring.waypoints.length}`;
    const dropButton = document.createElement("button");
    dropButton.className = "primary";
    dropButton.dataset["testid"] = "drop-waypoint";
    dropButton.textContent = "+ Drop Waypoint";
    dropButton.addEventListener("click", () => {
      const newId = deps.session.dropWaypoint();
      if (newId !== null) {
        expandedId = newId;
        render();
      }
    });
    heading.append(h2, dropButton);
    section.append(heading);

    if (authoring.waypoints.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.dataset["testid"] = "waypoints-empty";
      empty.textContent = "No waypoints yet. Drop one to get started.";
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
    nameInput.dataset["testid"] = "tour-name";
    nameInput.value = authoring.name;
    nameInput.addEventListener("change", () => {
      deps.dispatch(
        setTourMeta({
          name: nameInput.value,
          description: authoring.description,
        }),
      );
    });
    section.append(buildLabeledField("Name", nameInput, "tour-name"));

    const descriptionInput = document.createElement("input");
    descriptionInput.dataset["testid"] = "tour-description";
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
      buildLabeledField("Description", descriptionInput, "tour-description"),
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
    exportButton.dataset["testid"] = "export";
    exportButton.textContent = "Export & Pack";
    section.append(exportButton);

    const status = document.createElement("p");
    status.dataset["testid"] = "export-status";
    section.append(status);

    exportButton.addEventListener("click", () => {
      void (async () => {
        exportButton.disabled = true;
        status.textContent = "";
        status.dataset["state"] = "";
        const result = deps.session.exportTour();
        try {
          await deps.packAndDownload(result.tour, result.assetFiles);
        } catch (error) {
          status.textContent =
            error instanceof Error ? error.message : String(error);
          status.dataset["state"] = "error";
          exportButton.disabled = false;
          return;
        }
        status.textContent = "Download started.";
        status.dataset["state"] = "ok";
        deps.onExport(result);
      })();
    });

    return section;
  }

  // A field's blur-triggered `change` dispatch (e.g. tabbing/clicking out of
  // the transcript textarea into "Drop Waypoint") lands mid-mousedown, before
  // the browser has resolved the in-flight click's mouseup. A real mousedown
  // -to-mouseup gap is tens of milliseconds even for a fast click — far
  // longer than any macrotask deferral — so delaying a full DOM teardown
  // doesn't stop it from landing mid-gesture and destroying the click's
  // target out from under it, silently swallowing that click (AC: reported
  // as "have to click twice"). The actual fix is to not tear down elements
  // the change didn't touch: each section only gets rebuilt when the slice
  // of state it renders from has actually changed (reference inequality —
  // Immer/RTK keep untouched slices referentially stable), so editing the
  // tour name never disturbs the Waypoints section's DOM (or vice versa),
  // regardless of timing.
  let renderedName: string | undefined;
  let renderedDescription: string | undefined;
  let tourDetailsEl: HTMLElement | null = null;

  let renderedWaypoints: AuthoringSliceState["waypoints"] | undefined;
  let renderedAssets: AuthoringSliceState["assets"] | undefined;
  let renderedExpandedId: string | null | undefined;
  let waypointsEl: HTMLElement | null = null;

  let exportSectionEl: HTMLElement | null = null;

  /** Swaps `current` for `next` in place (or appends, on first render) and
   *  returns `next` so callers can update their "last rendered" ref in one line. */
  function replaceSection(
    current: HTMLElement | null,
    next: HTMLElement,
  ): HTMLElement {
    if (current === null) root.append(next);
    else current.replaceWith(next);
    return next;
  }

  function tourDetailsIsStale(authoring: AuthoringSliceState): boolean {
    return (
      tourDetailsEl === null ||
      authoring.name !== renderedName ||
      authoring.description !== renderedDescription
    );
  }

  function waypointsSectionIsStale(authoring: AuthoringSliceState): boolean {
    return (
      waypointsEl === null ||
      authoring.waypoints !== renderedWaypoints ||
      authoring.assets !== renderedAssets ||
      expandedId !== renderedExpandedId
    );
  }

  function render(): void {
    const authoring = deps.getState().authoring;

    if (tourDetailsIsStale(authoring)) {
      tourDetailsEl = replaceSection(
        tourDetailsEl,
        renderTourDetailsSection(authoring),
      );
      renderedName = authoring.name;
      renderedDescription = authoring.description;
    }

    if (waypointsSectionIsStale(authoring)) {
      waypointsEl = replaceSection(
        waypointsEl,
        renderWaypointsSection(authoring),
      );
      renderedWaypoints = authoring.waypoints;
      renderedAssets = authoring.assets;
      renderedExpandedId = expandedId;
    }

    if (exportSectionEl === null) {
      exportSectionEl = renderExportSection();
      root.append(exportSectionEl);
    }
  }

  const unsubscribe = deps.subscribe(() => {
    render();
  });
  render();

  return {
    destroy(): void {
      unsubscribe();
      root.innerHTML = "";
    },
  };
}
