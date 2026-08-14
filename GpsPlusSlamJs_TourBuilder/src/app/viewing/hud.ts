/**
 * The in-session HUD (plan VC9, VC23, VC24, VC15f).
 *
 * Mounted into the AR container, i.e. the WebXR DOM Overlay root, so it
 * composites over the camera feed. Holds the map toggle, the End-tour control,
 * the alignment/tracking coaching line, and a one-shot notice channel for
 * things the visitor must be told (audio blocked, map tiles unavailable).
 *
 * Knows nothing about the store or the scene — `viewing-app.ts` pushes text
 * in and reacts to the callbacks.
 */

export interface HudOptions {
  readonly onToggleMap: () => void;
  readonly onEndTour: () => void;
  /** Preview mode only: walk the breadcrumb automatically (VC25). */
  readonly onToggleAutopilot?: () => void;
}

export interface Hud {
  /** The alignment/tracking coaching line (plan VC23). Empty string hides it. */
  setStatus(message: string): void;
  /** One-shot notice: audio blocked, tiles offline, a failed asset. */
  showNotice(message: string): void;
  setMapToggleLabel(label: string): void;
  /** No-op unless the HUD was mounted with an autopilot toggle. */
  setAutopilotLabel(label: string): void;
  destroy(): void;
}

export function mountHud(container: HTMLElement, options: HudOptions): Hud {
  const element = document.createElement("div");
  element.className = "ar-hud";
  element.dataset.testid = "viewing-hud";

  const status = document.createElement("p");
  status.className = "status-banner";
  status.dataset.testid = "viewing-hud-status";
  status.hidden = true;

  const notice = document.createElement("p");
  notice.className = "error-banner";
  notice.dataset.testid = "viewing-hud-notice";
  notice.hidden = true;

  const controls = document.createElement("div");
  controls.className = "ar-hud-controls";

  const mapToggle = document.createElement("button");
  mapToggle.textContent = "Map";
  mapToggle.dataset.testid = "viewing-map-toggle";
  mapToggle.addEventListener("click", () => options.onToggleMap());

  const endTour = document.createElement("button");
  endTour.textContent = "End tour";
  endTour.dataset.testid = "viewing-end-tour";
  endTour.addEventListener("click", () => options.onEndTour());

  const autopilot = document.createElement("button");
  autopilot.textContent = "Auto-walk";
  autopilot.dataset.testid = "viewing-autopilot";
  if (options.onToggleAutopilot) {
    autopilot.addEventListener("click", () => options.onToggleAutopilot?.());
    controls.appendChild(autopilot);
  }

  controls.append(mapToggle, endTour);
  element.append(status, notice, controls);
  container.appendChild(element);

  return {
    setStatus(message) {
      status.textContent = message;
      status.hidden = message === "";
    },
    showNotice(message) {
      notice.textContent = message;
      notice.hidden = false;
    },
    setMapToggleLabel(label) {
      mapToggle.textContent = label;
    },
    setAutopilotLabel(label) {
      autopilot.textContent = label;
    },
    destroy() {
      element.remove();
    },
  };
}
