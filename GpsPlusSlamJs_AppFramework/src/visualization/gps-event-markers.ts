/**
 * GPS Event Markers Visualizer
 *
 * Creates and manages Three.js meshes for visualizing GPS events
 * in the 3D AR scene. Shows two types of markers:
 * - Raw GPS markers (yellow): Where GPS readings were received — added to scene root
 * - Fused markers (cyan): AR odometry positions — added to arWorldGroup so that
 *   scene-graph propagation (arWorldGroup.matrix × odomPos) handles alignment
 *
 * ARCHITECTURE NOTE:
 * - Raw GPS markers are in scene root (GPS world space), fixed forever
 * - Fused markers are children of arWorldGroup with position = raw odom coords;
 *   when applyAlignmentMatrix() updates arWorldGroup.matrix, all fused markers'
 *   world positions update automatically via Three.js scene-graph propagation.
 */

import * as THREE from 'three';
import { getScene, getArWorldGroup } from '../ar/webxr-session';
import type { LatLong, Vector3 } from 'gps-plus-slam-js';
import { createLogger } from '../utils/logger';
import { disposeMeshArray } from './three-dispose';
import { VIS_COLORS } from './vis-colors';

const log = createLogger('GpsEventVisualizer');

/** Sphere radius in meters (8cm - smaller than reference point markers) */
const GPS_MARKER_RADIUS = 0.08;

/** Slightly larger radius for alignment snapshots to stand out */
const SNAPSHOT_MARKER_RADIUS = 0.1;

/**
 * Manager for GPS event visualization
 */
export class GpsEventVisualizer {
  private rawGpsMarkers: THREE.Mesh[] = [];
  private fusedMarkers: THREE.Mesh[] = [];
  private snapshotMarkers: THREE.Mesh[] = [];
  private zeroRef: LatLong | null = null;
  private eventCounter = 0;
  private snapshotCounter = 0;

  /**
   * Set the GPS zero reference (origin for coordinate conversion).
   * Must be called before adding GPS events.
   *
   * @param zero - GPS coordinates of the origin
   */
  setZeroRef(zero: LatLong): void {
    this.zeroRef = zero;
  }

  /**
   * Get the current zero reference
   */
  getZeroRef(): LatLong | null {
    return this.zeroRef;
  }

  /**
   * Add a GPS event to the visualization.
   * Creates both a raw GPS marker and a fused alignment marker.
   *
   * @param gpsCoords - GPS position as [x, y, z] meters from zero reference
   * @param odomPosition - AR odometry position at the time of GPS reading
   */
  addGpsEvent(gpsCoords: Vector3, odomPosition: Vector3): void {
    if (!this.zeroRef) {
      log.warn('No zero reference set');
      return;
    }

    const scene = getScene();
    if (!scene) {
      log.warn('Scene not available');
      return;
    }

    const eventId = this.eventCounter++;

    // Create raw GPS marker (yellow) at GPS coordinates — added to scene root
    const rawMesh = this.createMarkerMesh(
      VIS_COLORS.RAW_GPS.hex,
      'raw-gps',
      eventId
    );
    rawMesh.position.set(gpsCoords[0], gpsCoords[1], gpsCoords[2]);
    scene.add(rawMesh);
    this.rawGpsMarkers.push(rawMesh);

    // Create fused marker (cyan) at raw odom position — added to arWorldGroup
    // Scene-graph propagation: world pos = arWorldGroup.matrix × odomPos
    const arWorldGroup = getArWorldGroup();
    if (!arWorldGroup) {
      log.warn('arWorldGroup not available, skipping fused marker');
      return;
    }

    const fusedMesh = this.createMarkerMesh(
      VIS_COLORS.FUSED_VIO.hex,
      'fused',
      eventId
    );
    fusedMesh.position.set(odomPosition[0], odomPosition[1], odomPosition[2]);
    arWorldGroup.add(fusedMesh);
    this.fusedMarkers.push(fusedMesh);

    log.debug(
      `Added GPS event ${eventId}: raw=[${gpsCoords.join(',')}] odom=[${odomPosition.join(',')}]`
    );
  }

  /**
   * Add an alignment snapshot marker at the given NUE position.
   * Snapshots represent the system's best GPS estimate at each alignment update.
   * Added to scene root (GPS world space), not arWorldGroup.
   */
  addAlignmentSnapshot(nuePosition: Vector3): void {
    const scene = getScene();
    if (!scene) {
      log.warn('Scene not available for alignment snapshot');
      return;
    }

    const id = this.snapshotCounter++;
    const mesh = this.createMarkerMesh(
      VIS_COLORS.ALIGNMENT_SNAPSHOT.hex,
      'alignment-snapshot',
      id,
      SNAPSHOT_MARKER_RADIUS,
      0.5
    );
    mesh.position.set(nuePosition[0], nuePosition[1], nuePosition[2]);
    scene.add(mesh);
    this.snapshotMarkers.push(mesh);

    log.debug(`Added alignment snapshot ${id}: pos=[${nuePosition.join(',')}]`);
  }

  /**
   * Get the NUE positions of all alignment snapshot markers.
   * Used at session end to convert to GPS coordinates for the summary map.
   */
  getAlignmentSnapshotPositions(): Vector3[] {
    return this.snapshotMarkers.map(
      (m) => [m.position.x, m.position.y, m.position.z] as Vector3
    );
  }

  /**
   * Create a sphere marker mesh with the given color and name.
   */
  private createMarkerMesh(
    color: number,
    namePrefix: string,
    eventId: number,
    radius: number = GPS_MARKER_RADIUS,
    opacity: number = 0.3
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 12, 12);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${namePrefix}-${eventId}`;
    return mesh;
  }

  /**
   * Clear all markers from the scene and reset state.
   */
  clearAll(): void {
    const scene = getScene();
    const arWorldGroup = getArWorldGroup();

    disposeMeshArray(this.rawGpsMarkers, scene);
    disposeMeshArray(this.fusedMarkers, arWorldGroup);
    disposeMeshArray(this.snapshotMarkers, scene);

    // Reset state
    this.zeroRef = null;
    this.eventCounter = 0;
    this.snapshotCounter = 0;
  }

  /**
   * Get count of visible markers.
   */
  getCounts(): { raw: number; fused: number; snapshots: number } {
    return {
      raw: this.rawGpsMarkers.length,
      fused: this.fusedMarkers.length,
      snapshots: this.snapshotMarkers.length,
    };
  }
}

/**
 * Singleton instance for global use.
 * Import this to visualize GPS events.
 */
export const gpsEventVisualizer = new GpsEventVisualizer();
