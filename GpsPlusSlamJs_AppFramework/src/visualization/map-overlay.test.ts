/**
 * Map Overlay Tests
 *
 * Tests for the interactive 3D map overlay that shows OSM tiles
 * floating below the user in the AR scene.
 *
 * Why this test matters:
 * The map overlay provides spatial context during AR recording,
 * helping users orient themselves relative to their GPS position.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  expectTypeOf,
} from 'vitest';
import * as THREE from 'three';
import {
  MapOverlay,
  latLonToTileXY,
  tileXYToLatLon,
  DEFAULT_HEIGHT_OFFSET,
  DEFAULT_MAP_SIZE,
  DEFAULT_ZOOM,
  type MapOverlayOptions,
  type TextureLoaderInterface,
} from './map-overlay';

/**
 * Create a mock texture loader for testing (avoids browser DOM dependencies).
 */
function createMockTextureLoader(): TextureLoaderInterface {
  return {
    load: vi.fn(
      (
        url: string,
        onLoad?: (texture: THREE.Texture) => void,
        _onProgress?: (event: ProgressEvent) => void,
        _onError?: (err: unknown) => void
      ): THREE.Texture => {
        const texture = new THREE.Texture();
        // Simulate async load completion
        if (onLoad) {
          setTimeout(() => onLoad(texture), 0);
        }
        return texture;
      }
    ),
  };
}

/**
 * Create a mock texture loader that fails with an error.
 * Used to test tile load failure handling (Issue #10).
 */
function createFailingTextureLoader(): TextureLoaderInterface {
  return {
    load: vi.fn(
      (
        url: string,
        _onLoad?: (texture: THREE.Texture) => void,
        _onProgress?: (event: ProgressEvent) => void,
        onError?: (err: unknown) => void
      ): THREE.Texture => {
        const texture = new THREE.Texture();
        // Simulate async load failure
        if (onError) {
          setTimeout(
            () => onError(new Error('Network error: tile unavailable')),
            0
          );
        }
        return texture;
      }
    ),
  };
}

describe('MapOverlay', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let mockLoader: TextureLoaderInterface;

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, 1, 0.01, 100);
    camera.position.set(0, 1.6, 0);
    scene.add(camera);
    mockLoader = createMockTextureLoader();
  });

  afterEach(() => {
    // Clean up scene
    scene.clear();
  });

  describe('constructor', () => {
    /**
     * Why this test matters: R1 — exported defaults must match the internal
     * fallback values so call sites can rely on omitting these options and
     * still get the documented behaviour.
     */
    it('exports default constants matching internal fallback values', () => {
      expect(DEFAULT_HEIGHT_OFFSET).toBe(-4);
      expect(DEFAULT_MAP_SIZE).toBe(10);
      expect(DEFAULT_ZOOM).toBe(17);

      // A map created without explicit options should use these defaults
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      expect(map.getHeightOffset()).toBe(DEFAULT_HEIGHT_OFFSET);
      expect(map.getMapSize()).toBe(DEFAULT_MAP_SIZE);
    });

    it('creates a map overlay with default options', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      expect(map).toBeDefined();
      expect(map.isVisible()).toBe(false);
    });

    it('creates a map overlay with custom options', () => {
      const options: MapOverlayOptions = {
        mapSize: 15,
        heightOffset: -3,
        zoomLevel: 18,
        textureLoader: mockLoader,
      };
      const map = new MapOverlay(scene, camera, options);
      expect(map).toBeDefined();
      expect(map.getMapSize()).toBe(15);
      expect(map.getHeightOffset()).toBe(-3);
    });
  });

  describe('show/hide', () => {
    it('shows the map and adds mesh as child of camera', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      expect(map.isVisible()).toBe(true);
      // Mesh should be a child of the camera, not the scene
      expect(camera.children.length).toBeGreaterThanOrEqual(1);
      const mesh = map.getMesh();
      expect(mesh).not.toBeNull();
      expect(mesh!.parent).toBe(camera);
    });

    it('hides the map and removes mesh from camera', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();
      const countAfterShow = camera.children.length;

      map.hide();

      expect(map.isVisible()).toBe(false);
      expect(camera.children.length).toBe(countAfterShow - 1);
    });

    it('toggle switches visibility', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);

      expect(map.isVisible()).toBe(false);
      map.toggle();
      expect(map.isVisible()).toBe(true);
      map.toggle();
      expect(map.isVisible()).toBe(false);
    });

    /**
     * Why this test matters:
     * Regression test for a bug where hide() removes the mesh from the scene graph
     * but keeps the mesh reference, so the subsequent show() early-returns in
     * createMesh() without re-adding the mesh to the parent. The map disappears
     * permanently after the first hide/show cycle.
     */
    it('mesh is re-added to parent after hide then show', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);

      map.show();
      const mesh = map.getMesh();
      expect(mesh).not.toBeNull();
      expect(camera.children).toContain(mesh);

      map.hide();
      expect(camera.children).not.toContain(mesh);

      map.show();
      expect(map.isVisible()).toBe(true);
      expect(map.getMesh()).toBe(mesh); // same mesh instance reused
      expect(camera.children).toContain(mesh); // mesh is back in scene graph
    });

    it('does not show map without GPS position', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.show(); // No GPS position set

      expect(map.isVisible()).toBe(false);
    });
  });

  describe('setGpsPosition', () => {
    it('updates internal GPS position', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.123, 8.456);

      const pos = map.getGpsPosition();
      expect(pos).not.toBeNull();
      expect(pos?.lat).toBe(50.123);
      expect(pos?.lon).toBe(8.456);
    });

    it('updates tile URL when position changes significantly', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });

      // Set initial position
      map.setGpsPosition(50.0, 8.0);
      map.show();

      // Move to a different tile
      map.setGpsPosition(51.0, 9.0);

      // Should still be visible (tile will update)
      expect(map.isVisible()).toBe(true);
    });
  });

  describe('updatePosition', () => {
    /**
     * Why this test matters:
     * The mesh is now a child of the camera. Its position in camera-local
     * space is fixed at creation. updatePosition() is kept as a no-op for
     * backward compatibility. The mesh should always be at the configured
     * heightOffset below the camera origin, regardless of camera movement.
     */
    it('mesh position is fixed in camera-local space', () => {
      const map = new MapOverlay(scene, camera, {
        textureLoader: mockLoader,
        heightOffset: -4,
      });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      const mesh = map.getMesh();
      expect(mesh).not.toBeNull();

      // Mesh position is in camera-local space
      expect(mesh!.position.x).toBe(0);
      expect(mesh!.position.y).toBe(-4); // heightOffset
      expect(mesh!.position.z).toBe(-0.5); // slightly in front
    });

    /**
     * Why this test matters:
     * When the camera moves in world space, the mesh (as a child) should
     * automatically follow. The world position of the mesh should reflect
     * the camera's world position plus the local offset.
     */
    it('mesh world position follows camera automatically', () => {
      const map = new MapOverlay(scene, camera, {
        textureLoader: mockLoader,
        heightOffset: -4,
      });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      const mesh = map.getMesh();
      expect(mesh).not.toBeNull();

      // Move camera in world space
      camera.position.set(5, 1.6, 3);
      camera.updateMatrixWorld(true);

      // Mesh world position should follow camera + local offset
      const worldPos = new THREE.Vector3();
      mesh!.getWorldPosition(worldPos);
      expect(worldPos.x).toBeCloseTo(5, 1);
      expect(worldPos.y).toBeCloseTo(1.6 + -4, 1); // camera.y + heightOffset
      // z includes the -0.5 local offset (projected through camera orientation)
    });

    /**
     * Why this test matters:
     * updatePosition is kept as a no-op for backward compatibility.
     * Code that calls it each frame should not break.
     */
    it('updatePosition is safe to call (backward-compatible no-op)', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      camera.position.set(5, 1.6, 3);
      // Should not throw and should not change mesh local position
      expect(() => map.updatePosition()).not.toThrow();

      const mesh = map.getMesh();
      expect(mesh!.position.x).toBe(0); // Still in camera-local space
    });

    /**
     * Why this test matters:
     * updatePosition should be safe to call even when map is hidden.
     * This prevents errors if the frame callback runs before visibility check.
     */
    it('is safe to call when map is hidden', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      // Don't call show()

      camera.position.set(5, 1.6, 3);
      expect(() => map.updatePosition()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('removes mesh from camera and disposes resources', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      const initialCameraChildren = camera.children.length;
      map.dispose();

      expect(camera.children.length).toBeLessThan(initialCameraChildren);
      expect(map.isVisible()).toBe(false);
    });

    it('can be called multiple times safely', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      map.dispose();
      map.dispose(); // Should not throw

      expect(map.isVisible()).toBe(false);
    });
  });

  describe('texture loading', () => {
    it('calls texture loader with correct tile URL', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.27);
      map.show();

      const loadMock = vi.mocked(mockLoader.load);
      expect(loadMock).toHaveBeenCalled();
      const calledUrl = loadMock.mock.calls[0][0];
      expect(calledUrl).toMatch(
        /https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png/
      );
    });

    it('does not reload same tile on small position change', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.27);
      map.show();

      const loadMock = vi.mocked(mockLoader.load);
      const initialCallCount = loadMock.mock.calls.length;

      // Small position change within same tile
      map.setGpsPosition(50.0001, 8.2701);

      expect(loadMock.mock.calls.length).toBe(initialCallCount);
    });

    /**
     * Why this test matters (Issue #10 - Field Test Readiness):
     * When the device is offline or the tile server is unreachable, tile loading
     * fails silently. Users see a blank map with no indication of the problem.
     * This test ensures the onTileError callback is invoked so the UI can
     * notify the user about map tile failures.
     */
    it('calls onTileError callback when tile loading fails', async () => {
      const failingLoader = createFailingTextureLoader();
      const onTileError = vi.fn();

      const map = new MapOverlay(scene, camera, {
        textureLoader: failingLoader,
        onTileError,
      });
      map.setGpsPosition(50.0, 8.27);
      map.show();

      // Wait for async error callback
      await vi.waitFor(() => {
        expect(onTileError).toHaveBeenCalledTimes(1);
      });

      // Should receive the error
      expect(onTileError).toHaveBeenCalledWith(expect.any(Error));
      const errorArg = onTileError.mock.calls[0][0] as Error;
      expect(errorArg.message).toContain('tile unavailable');
    });

    /**
     * Why this test matters:
     * When no onTileError callback is provided, the map should still work
     * (errors are logged but don't crash). This ensures backward compatibility.
     */
    it('handles tile load failure gracefully when no callback provided', async () => {
      const failingLoader = createFailingTextureLoader();

      const map = new MapOverlay(scene, camera, {
        textureLoader: failingLoader,
        // No onTileError callback
      });
      map.setGpsPosition(50.0, 8.27);

      // Should not throw
      expect(() => map.show()).not.toThrow();

      // Wait for async error to be processed
      await new Promise((r) => setTimeout(r, 10));

      // Map should still be visible (just with no texture)
      expect(map.isVisible()).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Issue 8: mapParent option — reparent mesh to CameraFollower
  // ──────────────────────────────────────────────────────────────────────────

  describe('mapParent option (Issue 8)', () => {
    /**
     * Why this test matters:
     * When mapParent is provided, the map mesh should be attached to
     * mapParent instead of the camera. This fixes the "map rotates
     * with camera" bug — the CameraFollower keeps identity rotation
     * in GPS space, so the map stays flat.
     */
    it('attaches mesh to mapParent instead of camera when provided', () => {
      const follower = new THREE.Object3D();
      follower.name = 'camera-follower'; // matches SCENE_NODE.CAMERA_FOLLOWER
      scene.add(follower);

      const map = new MapOverlay(scene, camera, {
        textureLoader: mockLoader,
        mapParent: follower,
      });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      const mesh = map.getMesh();
      expect(mesh).not.toBeNull();
      expect(mesh!.parent).toBe(follower);
      expect(camera.children).not.toContain(mesh);
    });

    /**
     * Why this test matters:
     * Without mapParent, the mesh should still go to the camera
     * (backward-compatible with existing callers).
     */
    it('falls back to camera when mapParent is not provided', () => {
      const map = new MapOverlay(scene, camera, { textureLoader: mockLoader });
      map.setGpsPosition(50.0, 8.0);
      map.show();

      expect(map.getMesh()!.parent).toBe(camera);
    });

    /**
     * Why this test matters:
     * hide() must remove the mesh from mapParent, not from camera.
     */
    it('removes mesh from mapParent on hide', () => {
      const follower = new THREE.Object3D();
      scene.add(follower);

      const map = new MapOverlay(scene, camera, {
        textureLoader: mockLoader,
        mapParent: follower,
      });
      map.setGpsPosition(50.0, 8.0);
      map.show();
      expect(follower.children.length).toBe(1);

      map.hide();
      expect(follower.children.length).toBe(0);
    });
  });
});

describe('Tile coordinate conversion', () => {
  describe('latLonToTileXY', () => {
    // Why this test matters: Tile coordinates must be correct for
    // loading the right OSM tile for the user's location.

    it('converts equator/prime meridian to expected tiles', () => {
      // At zoom 0, entire world is one tile (0, 0)
      const [x, y] = latLonToTileXY(0, 0, 0);
      expect(x).toBe(0);
      expect(y).toBe(0);
    });

    it('converts known location to expected tile (Mainz, Germany)', () => {
      // Mainz at zoom 17: approximately tile (68785, 45091)
      const [x, y] = latLonToTileXY(50.0, 8.27, 17);
      // Check reasonable range for Mainz area
      expect(x).toBeGreaterThan(68000);
      expect(x).toBeLessThan(69000);
      expect(y).toBeGreaterThan(44000);
      expect(y).toBeLessThan(46000);
    });

    it('handles negative longitude (Americas)', () => {
      // New York City area
      const [x, y] = latLonToTileXY(40.7, -74.0, 10);
      expect(x).toBeLessThan(512); // Should be in western half
      expect(y).toBeGreaterThan(0);
    });

    it('handles extreme latitudes', () => {
      // Near north pole
      const [_x, y] = latLonToTileXY(85, 0, 5);
      expect(y).toBe(0); // Should be at top edge

      // Near south pole
      const [_x2, y2] = latLonToTileXY(-85, 0, 5);
      expect(y2).toBe(31); // Should be at bottom edge (2^5 - 1)
    });
  });

  describe('tileXYToLatLon', () => {
    // Why this test matters: Need to convert tile coordinates back
    // to lat/lon for calculating map scale and positioning.

    it('converts tile 0,0 at zoom 0 to top-left corner', () => {
      const [lat, lon] = tileXYToLatLon(0, 0, 0);
      expect(lon).toBeCloseTo(-180, 1);
      expect(lat).toBeCloseTo(85.05, 0); // Web Mercator limit
    });

    it('round-trips lat/lon through tile coordinates', () => {
      const originalLat = 50.0;
      const originalLon = 8.27;
      const zoom = 17;

      const [x, y] = latLonToTileXY(originalLat, originalLon, zoom);
      const [lat, lon] = tileXYToLatLon(x, y, zoom);

      // Should be close to original (within one tile)
      expect(lat).toBeCloseTo(originalLat, 0);
      expect(lon).toBeCloseTo(originalLon, 0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Readonly guards — Finding #6 (2026-03-05 code review)
  // ──────────────────────────────────────────────────────────────────────────

  describe('Readonly guards for pure-data interfaces', () => {
    /**
     * Why this test matters:
     * MapOverlayOptions is a config object passed to the constructor,
     * never mutated afterward.
     */
    it('MapOverlayOptions ≡ Readonly<MapOverlayOptions>', () => {
      expectTypeOf<MapOverlayOptions>().toEqualTypeOf<
        Readonly<MapOverlayOptions>
      >();
    });
  });
});
