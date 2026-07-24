/**
 * Tap-vs-drag-gated raycast picking, shared by every component whose desktop
 * interaction is "click a mesh, get the hit" (component 1's billboard,
 * component 2's in-world text). A small drag guard distinguishes a tap from an
 * OrbitControls camera-drag; component 8 swaps this `pointerup`-raycast for the
 * WebXR `select` ray while keeping the same downstream hit handling.
 *
 * Owns the raycast mechanics only — interpreting the hit's `userData` (which
 * mesh, which role) is each component's own concern via `onTap`.
 */
import {
  Raycaster,
  Vector2,
  type Camera,
  type Intersection,
  type Object3D,
} from "three";

const DRAG_TOLERANCE_PX = 5;
const MAX_CLICK_MS = 400;

/** The raycast target set every `*-interaction.ts` wrapper also takes. */
export interface PointerTapPickerTargetOptions {
  readonly domElement: HTMLElement;
  readonly camera: Camera;
  readonly getPickTargets: () => readonly Object3D[];
}

export function createPointerTapPicker(
  options: PointerTapPickerTargetOptions & {
    readonly onTap: (hit: Intersection<Object3D>) => void;
  },
): { dispose(): void } {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let downX = 0;
  let downY = 0;
  let downTime = 0;

  const onPointerDown = (event: PointerEvent): void => {
    downX = event.clientX;
    downY = event.clientY;
    downTime = performance.now();
  };

  const onPointerUp = (event: PointerEvent): void => {
    const movedPx = Math.hypot(event.clientX - downX, event.clientY - downY);
    if (
      movedPx > DRAG_TOLERANCE_PX ||
      performance.now() - downTime > MAX_CLICK_MS
    ) {
      return; // a drag / long-press — a camera orbit, not a tap
    }
    pick(event);
  };

  function pick(event: PointerEvent): void {
    const rect = options.domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, options.camera);

    const hit = raycaster.intersectObjects(
      options.getPickTargets() as Object3D[],
      false,
    )[0];
    if (hit !== undefined) {
      options.onTap(hit);
    }
  }

  options.domElement.addEventListener("pointerdown", onPointerDown);
  options.domElement.addEventListener("pointerup", onPointerUp);

  return {
    dispose(): void {
      options.domElement.removeEventListener("pointerdown", onPointerDown);
      options.domElement.removeEventListener("pointerup", onPointerUp);
    },
  };
}
