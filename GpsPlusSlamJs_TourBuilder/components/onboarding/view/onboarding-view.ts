/**
 * `mountOnboardingGate` — the reusable DOM view for component 9. Renders the
 * camera/GPS checklist, wires the Grant Access + Start buttons, and owns the
 * user gesture that unlocks the injected `AudioContext` on Start. Reused by
 * Goal-2 composition for both Authoring and Viewing bootstrap, not just the
 * demo (plan §Architecture).
 *
 * @see plans/2026-08-07-onboarding-plan.md
 */

import {
  canGrantAccess,
  canStart,
  explanationFor,
  gateReducer,
  initialGateState,
  type GateAction,
  type GateState,
} from "../core/permission-gate.js";
import {
  checkExistingPermissions,
  requestPermissions,
  type OnboardingAdapterDeps,
  type PermissionStatus,
} from "./onboarding-adapter.js";

export interface OnboardingGateDeps {
  readonly checkCameraPermission: () => Promise<PermissionStatus>;
  readonly checkGeolocationPermission: () => Promise<PermissionStatus>;
  readonly requestCameraPermission: () => Promise<PermissionStatus>;
  readonly requestGeolocationPermission: () => Promise<PermissionStatus>;
  /** Injected so tests never touch real Web Audio. */
  readonly createAudioContext: () => AudioContext;
  /** Fires once, only after the resumed context reports `running`. */
  readonly onComplete: (audioContext: AudioContext) => void;
  /** Optional: every new state, for a demo/debug state log. Not used by
   *  Goal-2 composition — the checklist UI itself is the product surface. */
  readonly onStateChange?: (state: GateState) => void;
}

export interface OnboardingGate {
  readonly destroy: () => void;
}

const PERMISSION_LABEL: Record<"camera" | "gps", string> = {
  camera: "Camera",
  gps: "Location",
};

function statusText(status: GateState["camera"]): string {
  switch (status) {
    case "unknown":
      return "Not yet requested";
    case "requesting":
      return "Waiting for permission…";
    case "granted":
      return "Granted";
    case "denied":
      return "Denied";
  }
}

export function mountOnboardingGate(
  root: HTMLElement,
  deps: OnboardingGateDeps,
): OnboardingGate {
  let state: GateState = initialGateState;
  let destroyed = false;

  const dispatch = (action: GateAction): void => {
    if (destroyed) return;
    state = gateReducer(state, action);
    render();
    deps.onStateChange?.(state);
  };

  const adapterDeps: OnboardingAdapterDeps = {
    checkCameraPermission: deps.checkCameraPermission,
    checkGeolocationPermission: deps.checkGeolocationPermission,
    requestCameraPermission: deps.requestCameraPermission,
    requestGeolocationPermission: deps.requestGeolocationPermission,
    dispatch,
  };

  function renderRow(kind: "camera" | "gps"): HTMLElement {
    const row = document.createElement("div");
    row.dataset.testid = `row-${kind}`;

    const label = document.createElement("span");
    label.textContent = `${PERMISSION_LABEL[kind]}: ${statusText(state[kind])}`;
    row.append(label);

    const explanation = explanationFor(state, kind);
    if (explanation) {
      const warning = document.createElement("p");
      warning.dataset.testid = `explanation-${kind}`;
      warning.style.color = "red";
      warning.textContent = explanation;
      row.append(warning);
    }

    return row;
  }

  function render(): void {
    root.innerHTML = "";

    root.append(renderRow("camera"), renderRow("gps"));

    const grantButton = document.createElement("button");
    grantButton.dataset.testid = "grant-access";
    grantButton.textContent = "Grant Access";
    grantButton.disabled = !canGrantAccess(state);
    grantButton.addEventListener("click", () => {
      void requestPermissions(adapterDeps);
    });
    root.append(grantButton);

    const startButton = document.createElement("button");
    startButton.dataset.testid = "start";
    startButton.textContent = "Start";
    startButton.disabled = !canStart(state);
    startButton.addEventListener("click", handleStart);
    root.append(startButton);
  }

  function handleStart(): void {
    const audioContext = deps.createAudioContext();
    // O7: resume() must be the click handler's first statement — the Web
    // Audio autoplay policy needs the resume call itself inside the gesture.
    const resumed = audioContext.resume();
    void resumed.then(() => {
      const unlocked = audioContext.state === "running";
      dispatch({ type: "audioUnlocked", unlocked });
      if (unlocked) deps.onComplete(audioContext);
    });
  }

  render();
  deps.onStateChange?.(state);
  void checkExistingPermissions(adapterDeps);

  return {
    destroy(): void {
      destroyed = true;
      root.innerHTML = "";
    },
  };
}
