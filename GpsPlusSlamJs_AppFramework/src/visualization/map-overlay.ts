/**
 * Map Overlay Module
 *
 * Creates and manages a 3D map overlay that displays OSM tiles
 * floating below the user in the AR scene. The map is attached
 * as a child of the camera so it automatically follows the user
 * and is always visible at a fixed position in the camera's
 * local coordinate space (below and slightly in front).
 *
 * ARCHITECTURE NOTE:
 * - Map mesh is a child of the camera (camera-local space)
 * - Position is fixed relative to camera: below + slightly in front
 * - No per-frame position update needed — Three.js handles it
 * - OSM tiles are loaded as textures on a PlaneGeometry
 */

import * as THREE from 'three';
import type { LatLong } from 'gps-plus-slam-js';
import { createLogger } from '../utils/logger';
import { disposeObject3D } from './three-dispose';

const log = createLogger('MapOverlay');

/** Default zoom level for OSM tiles (higher = more detail, smaller area) */
export const DEFAULT_ZOOM = 17;

/** Default map size in meters */
export const DEFAULT_MAP_SIZE = 10;

/** Default height offset below camera (negative = below) */
export const DEFAULT_HEIGHT_OFFSET = -4;

/**
 * Interface for loading textures (allows mocking in tests).
 */
export interface TextureLoaderInterface {
  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): THREE.Texture;
}

/**
 * Configuration options for the map overlay.
 */
export interface MapOverlayOptions {
  /** Size of the map in meters (default: 10) */
  readonly mapSize?: number;
  /** Height offset below camera in meters (default: -4) */
  readonly heightOffset?: number;
  /** OSM zoom level 0-19 (default: 17) */
  readonly zoomLevel?: number;
  /** Base URL for tile server (default: OSM) */
  readonly tileServerUrl?: string;
  /** Custom texture loader (for testing) */
  readonly textureLoader?: TextureLoaderInterface;
  /** Called when a map tile fails to load (e.g., offline, server error) */
  readonly onTileError?: (error: unknown) => void;
  /**
   * Object3D to attach the map mesh to instead of the camera.
   * When provided, the mesh is added to mapParent (e.g., a CameraFollower)
   * so the map stays GPS-world-aligned and does not rotate with the camera.
   * Defaults to camera when not provided (backward-compatible).
   */
  readonly mapParent?: THREE.Object3D;
}

/**
 * Convert latitude/longitude to tile X/Y coordinates.
 * Uses Web Mercator projection (EPSG:3857).
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param zoom - Zoom level (0-19)
 * @returns [tileX, tileY] as integers
 */
export function latLonToTileXY(
  lat: number,
  lon: number,
  zoom: number
): [number, number] {
  const n = Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;

  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  // Clamp to valid range
  return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
}

/**
 * Convert tile X/Y coordinates back to latitude/longitude.
 * Returns the top-left corner of the tile.
 *
 * @param x - Tile X coordinate
 * @param y - Tile Y coordinate
 * @param zoom - Zoom level
 * @returns [lat, lon] in degrees
 */
export function tileXYToLatLon(
  x: number,
  y: number,
  zoom: number
): [number, number] {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;

  return [lat, lon];
}

/**
 * Interactive 3D map overlay that displays OSM tiles in the AR scene.
 * The map floats below the user and follows their horizontal movement.
 */
export class MapOverlay {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private options: Required<
    Omit<MapOverlayOptions, 'textureLoader' | 'onTileError' | 'mapParent'>
  >;
  private onTileError?: (error: unknown) => void;
  private mapParent: THREE.Object3D;

  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private textureLoader: TextureLoaderInterface;

  private gpsPosition: LatLong | null = null;
  private currentTile: { x: number; y: number } | null = null;
  private visible = false;

  /**
   * Create a new map overlay.
   *
   * @param scene - The Three.js scene to add the map to
   * @param camera - The camera to follow (for positioning)
   * @param options - Configuration options
   */
  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: MapOverlayOptions = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.options = {
      mapSize: options.mapSize ?? DEFAULT_MAP_SIZE,
      heightOffset: options.heightOffset ?? DEFAULT_HEIGHT_OFFSET,
      zoomLevel: options.zoomLevel ?? DEFAULT_ZOOM,
      tileServerUrl:
        options.tileServerUrl ??
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    };
    this.textureLoader = options.textureLoader ?? new THREE.TextureLoader();
    this.onTileError = options.onTileError;
    this.mapParent = options.mapParent ?? camera;
  }

  /**
   * Set the current GPS position for tile loading.
   *
   * @param lat - Latitude in degrees
   * @param lon - Longitude in degrees
   */
  setGpsPosition(lat: number, lon: number): void {
    this.gpsPosition = { lat, lon };

    if (this.visible) {
      this.updateTile();
    }
  }

  /**
   * Get the current GPS position.
   */
  getGpsPosition(): LatLong | null {
    return this.gpsPosition;
  }

  /**
   * Show the map overlay.
   * Requires GPS position to be set first.
   */
  show(): void {
    if (!this.gpsPosition) {
      log.warn('Cannot show map - no GPS position set');
      return;
    }

    if (this.visible) {
      return;
    }

    this.createMesh();
    this.updateTile();
    this.visible = true;
    log.info('Map overlay shown');
  }

  /**
   * Hide the map overlay.
   */
  hide(): void {
    if (!this.visible) {
      return;
    }

    this.removeMesh();
    this.visible = false;
    log.info('Map overlay hidden');
  }

  /**
   * Toggle map visibility.
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if the map is currently visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Get the map size in meters.
   */
  getMapSize(): number {
    return this.options.mapSize;
  }

  /**
   * Get the height offset below camera.
   */
  getHeightOffset(): number {
    return this.options.heightOffset;
  }

  /**
   * Get the mesh (for testing).
   */
  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  /**
   * Update the map position to follow the camera.
   *
   * Since the mesh is now a child of the camera, Three.js handles
   * world-space transforms automatically. This method is kept for
   * backward compatibility but is a no-op (position is set once in
   * createMesh and doesn't need per-frame updates).
   */
  updatePosition(): void {
    // No-op: mesh is a child of the camera, so its position in
    // camera-local space is fixed. Three.js scene graph propagation
    // handles world transforms automatically.
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    this.hide();

    if (this.mesh) {
      disposeObject3D(this.mesh);
    }

    this.geometry = null;
    this.material = null;
    this.mesh = null;
    this.currentTile = null;
  }

  /**
   * Create the map mesh (plane facing up).
   */
  private createMesh(): void {
    if (this.mesh) {
      // Mesh was previously created but removed from parent by hide() — re-add it
      this.mapParent.add(this.mesh);
      return;
    }

    this.geometry = new THREE.PlaneGeometry(
      this.options.mapSize,
      this.options.mapSize
    );

    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'map-overlay';

    // Rotate to face up (XZ plane)
    this.mesh.rotation.x = -Math.PI / 2;

    // Position in camera-local space: below and slightly in front
    this.mesh.position.set(0, this.options.heightOffset, -0.5);

    // Add as child of mapParent (camera or CameraFollower) so it follows automatically
    this.mapParent.add(this.mesh);
  }

  /**
   * Remove the mesh from the camera.
   */
  private removeMesh(): void {
    if (this.mesh) {
      this.mapParent.remove(this.mesh);
      // Don't dispose geometry/material here - keep for reuse
    }
  }

  /**
   * Update the tile texture based on current GPS position.
   */
  private updateTile(): void {
    if (!this.gpsPosition || !this.material) {
      return;
    }

    const [x, y] = latLonToTileXY(
      this.gpsPosition.lat,
      this.gpsPosition.lon,
      this.options.zoomLevel
    );

    // Check if tile has changed
    if (this.currentTile?.x === x && this.currentTile?.y === y) {
      return;
    }

    this.currentTile = { x, y };

    // Build tile URL
    const url = this.options.tileServerUrl
      .replace('{z}', String(this.options.zoomLevel))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    log.info(`Loading tile: z=${this.options.zoomLevel}, x=${x}, y=${y}`);

    // Load new texture
    this.textureLoader.load(
      url,
      (texture) => {
        if (this.material) {
          // Dispose old texture
          if (this.material.map) {
            this.material.map.dispose();
          }
          this.material.map = texture;
          this.material.needsUpdate = true;
        }
      },
      undefined,
      (error) => {
        log.error('Failed to load map tile:', error);
        // Issue #10: Notify caller so UI can display error to user
        this.onTileError?.(error);
      }
    );
  }
}
