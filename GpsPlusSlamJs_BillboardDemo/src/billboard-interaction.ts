/**
 * Pointer picking for the demo (view layer).
 *
 * Raycasts the billboards' sprite + panel meshes on a click and reports a
 * classified hit: a sprite hit (by id) or a panel hit (by id + the local UV,
 * which panel-layout.ts turns into a toggle/seek intent). A small drag guard
 * distinguishes a tap from an OrbitControls camera-drag.
 *
 * This is the only part that differs between desktop and AR: component 8 swaps
 * the `pointerup`-raycast for the WebXR `select` ray, keeping the same
 * sprite-click / panel-hit callbacks. Invisible (inactive) panels are skipped
 * by the raycaster automatically, so only the open panel is interactive.
 */
import { Raycaster, Vector2, type Camera, type Object3D } from "three";

import type { BillboardUserData } from "./clickable-billboard.js";

const DRAG_TOLERANCE_PX = 5;
const MAX_CLICK_MS = 400;

export function createBillboardInteraction(options: {
  readonly domElement: HTMLElement;
  readonly camera: Camera;
  readonly getPickTargets: () => readonly Object3D[];
  readonly onSpriteClick: (id: string) => void;
  readonly onPanelHit: (id: string, uv: { u: number; v: number }) => void;
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
      return; // a drag / long-press — that was a camera orbit, not a tap
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
    if (hit === undefined) {
      return;
    }
    const data = hit.object.userData as Partial<BillboardUserData>;
    if (data.billboardId === undefined) {
      return;
    }
    if (data.role === "sprite") {
      options.onSpriteClick(data.billboardId);
    } else if (data.role === "panel" && hit.uv) {
      options.onPanelHit(data.billboardId, { u: hit.uv.x, v: hit.uv.y });
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
