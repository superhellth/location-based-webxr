/**
 * Keep a perspective camera and renderer in sync with the window size.
 *
 * Tiny view-layer helper shared by the component demos (both wire the same
 * `resize` handler), so the boilerplate lives once. Framework-free.
 */
import type { PerspectiveCamera, WebGLRenderer } from "three";

/** Attach a window `resize` listener that keeps `camera`/`renderer` sized. */
export function attachResize(
  camera: PerspectiveCamera,
  renderer: WebGLRenderer,
): void {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
