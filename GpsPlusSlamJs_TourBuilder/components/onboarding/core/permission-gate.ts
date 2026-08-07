/**
 * Onboarding permissions gate — the pure heart of component 9 (TASK.md §2.3).
 * Start is only enabled once the browser itself has reported both camera and
 * GPS as granted; there is no user-ticked checkbox anywhere in this state.
 *
 * Framework-free: no browser APIs, no DOM. `view/onboarding-adapter.ts` maps
 * the framework's `PermissionStatus` onto the actions below; this module
 * never calls `getUserMedia`/`geolocation` itself.
 *
 * @see plans/2026-08-07-onboarding-plan.md
 */

export type PermissionState = "unknown" | "requesting" | "granted" | "denied";

export type PermissionKind = "camera" | "gps";

export interface GateState {
  readonly camera: PermissionState;
  readonly gps: PermissionState;
  readonly cameraMessage?: string | undefined;
  readonly gpsMessage?: string | undefined;
  readonly audioUnlocked: boolean;
}

export const initialGateState: GateState = {
  camera: "unknown",
  gps: "unknown",
  audioUnlocked: false,
};

export type GateAction =
  | { readonly type: "grantAccessRequested" }
  | {
      readonly type: "permissionResult";
      readonly kind: PermissionKind;
      readonly granted: boolean;
      readonly message?: string | undefined;
    }
  | { readonly type: "audioUnlocked"; readonly unlocked: boolean };

export function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case "grantAccessRequested":
      return {
        ...state,
        camera: "requesting",
        gps: "requesting",
        cameraMessage: undefined,
        gpsMessage: undefined,
      };
    case "permissionResult": {
      const status: PermissionState = action.granted ? "granted" : "denied";
      return action.kind === "camera"
        ? { ...state, camera: status, cameraMessage: action.message }
        : { ...state, gps: status, gpsMessage: action.message };
    }
    case "audioUnlocked":
      return { ...state, audioUnlocked: action.unlocked };
  }
}

export function canGrantAccess(state: GateState): boolean {
  return state.camera !== "requesting" && state.gps !== "requesting";
}

export function canStart(state: GateState): boolean {
  return state.camera === "granted" && state.gps === "granted";
}

export function explanationFor(
  state: GateState,
  kind: PermissionKind,
): string | null {
  if (kind === "camera") {
    return state.camera === "denied" ? (state.cameraMessage ?? null) : null;
  }
  return state.gps === "denied" ? (state.gpsMessage ?? null) : null;
}
