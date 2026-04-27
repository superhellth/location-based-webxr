/**
 * CSS3D Renderer Manager
 *
 * Manages the lifecycle of a CSS3DRenderer that composites DOM elements
 * (e.g., a Leaflet map) into the 3D scene alongside the WebGL renderer.
 *
 * The CSS3DRenderer creates its own DOM element which is positioned
 * absolutely on top of the WebGL canvas. It renders CSS3DObjects
 * (Three.js objects wrapping DOM elements) using CSS 3D transforms.
 *
 * Usage:
 *   const mgr = createCss3dRendererManager(container, width, height);
 *   // In render loop:
 *   mgr.render(scene, camera);
 *   // On cleanup:
 *   mgr.dispose();
 */

import type * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

export interface Css3dRendererManager {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/**
 * Create and configure a CSS3DRenderer overlay for the given container.
 *
 * The CSS3D layer is positioned absolutely over the container with
 * `pointer-events: none` so it does not intercept clicks intended
 * for the WebGL canvas underneath.
 *
 * **Requirement:** The `container` element must have `position: relative`,
 * `absolute`, `fixed`, or `sticky`. If the container is `position: static`
 * (the CSS default), the overlay will float to the nearest positioned
 * ancestor instead of aligning with the container.
 */
export function createCss3dRendererManager(
  container: HTMLElement,
  width: number,
  height: number
): Css3dRendererManager {
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(width, height);

  // Style the CSS3D overlay layer
  const el = cssRenderer.domElement;
  el.style.position = 'absolute';
  el.style.top = '0px';
  el.style.left = '0px';
  el.style.pointerEvents = 'none';

  container.appendChild(el);

  let disposed = false;

  return {
    render(scene: THREE.Scene, camera: THREE.Camera): void {
      if (disposed) {
        return;
      }
      cssRenderer.render(scene, camera);
    },

    setSize(w: number, h: number): void {
      cssRenderer.setSize(w, h);
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      if (el.parentElement) {
        el.parentElement.removeChild(el);
      }
    },
  };
}
