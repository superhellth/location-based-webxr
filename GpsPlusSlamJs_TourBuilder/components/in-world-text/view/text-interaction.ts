/**
 * Pointer picking for the demo (view layer).
 *
 * Raycasts the label planes on a click and reports the hit label id + the local
 * UV, which the label turns into a Prev/Next intent via its own `hitTest`. A
 * small drag guard distinguishes a tap from an OrbitControls camera-drag.
 *
 * This is the only part that differs between desktop and immersive XR: the demo
 * swaps this `pointerup`-raycast for the WebXR `select` ray, keeping the same
 * label-hit callback — the exact "ray-production seam" component 8 reuses.
 */
import { Raycaster, Vector2, type Camera, type Object3D } from "three";

import type { TextLabelUserData } from "./in-world-text.js";

const DRAG_TOLERANCE_PX = 5;
const MAX_CLICK_MS = 400;

export function createTextInteraction(options: {
  readonly domElement: HTMLElement;
  readonly camera: Camera;
  readonly getPickTargets: () => readonly Object3D[];
  readonly onHit: (id: string, uv: { u: number; v: number }) => void;
}): { dispose(): void } {
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
    if (hit?.uv === undefined) {
      return;
    }
    const data = hit.object.userData as Partial<TextLabelUserData>;
    if (data.textLabelId !== undefined) {
      options.onHit(data.textLabelId, { u: hit.uv.x, v: hit.uv.y });
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
