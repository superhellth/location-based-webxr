/**
 * CSS3D Renderer Manager Tests
 *
 * Tests for the CSS3DRenderer lifecycle manager that provides the
 * rendering layer for CSS3DObjects (e.g., the Leaflet map overlay).
 *
 * Why this module exists:
 * CSS3DRenderer renders real DOM elements in 3D space alongside WebGL content.
 * Both the live AR scene and replay scene need one. This manager handles
 * creation, render-loop integration, sizing, and cleanup.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock CSS3DRenderer
const mockRender = vi.fn();
const mockSetSize = vi.fn();
let mockDomElement: HTMLDivElement;

vi.mock('three/addons/renderers/CSS3DRenderer.js', () => {
  class MockCSS3DRenderer {
    domElement: HTMLDivElement;
    constructor() {
      mockDomElement = document.createElement('div');
      this.domElement = mockDomElement;
    }
    setSize(...args: unknown[]) {
      mockSetSize(...args);
    }
    render(...args: unknown[]) {
      mockRender(...args);
    }
  }
  return {
    CSS3DRenderer: MockCSS3DRenderer,
    CSS3DObject: class extends THREE.Object3D {
      element: HTMLElement;
      constructor(el: HTMLElement) {
        super();
        this.element = el;
      }
    },
  };
});

import {
  createCss3dRendererManager,
  type Css3dRendererManager,
} from '../visualization/css3d-renderer-manager';

describe('Css3dRendererManager', () => {
  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let manager: Css3dRendererManager;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, 4 / 3, 0.1, 1000);
  });

  // Why: Manager must create CSS3DRenderer and insert its DOM element into the container
  it('should create a CSS3DRenderer and append domElement to container', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    // The CSS3DRenderer's domElement should be a child of container
    expect(container.children.length).toBe(1);
    expect(mockSetSize).toHaveBeenCalledWith(800, 600);
  });

  // Why: The CSS3D layer must be transparent and not block WebGL pointer events
  it('should set pointer-events to none on the domElement', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    const el = container.children[0] as HTMLElement;
    expect(el.style.pointerEvents).toBe('none');
  });

  // Why: CSS3D layer must be positioned on top of the WebGL canvas
  it('should position the domElement absolutely over the container', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    const el = container.children[0] as HTMLElement;
    expect(el.style.position).toBe('absolute');
    expect(el.style.top).toBe('0px');
    expect(el.style.left).toBe('0px');
  });

  // Why: render() is called every frame from the render loop
  it('should delegate render() to the CSS3DRenderer', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    manager.render(scene, camera);
    expect(mockRender).toHaveBeenCalledWith(scene, camera);
  });

  // Why: Resize must update the CSS3DRenderer size
  it('should resize the CSS3DRenderer', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    manager.setSize(1024, 768);
    expect(mockSetSize).toHaveBeenCalledWith(1024, 768);
  });

  // Why: Dispose must remove the domElement and clean up
  it('should remove domElement from container on dispose', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    expect(container.children.length).toBe(1);
    manager.dispose();
    expect(container.children.length).toBe(0);
  });

  // Why: dispose is idempotent
  it('should be safe to call dispose multiple times', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    manager.dispose();
    manager.dispose();
    expect(container.children.length).toBe(0);
  });

  // Why: render after dispose should be a no-op
  it('should not render after dispose', () => {
    manager = createCss3dRendererManager(container, 800, 600);
    manager.dispose();
    manager.render(scene, camera);
    // render was not called after dispose (only before if any)
    expect(mockRender).not.toHaveBeenCalled();
  });
});
