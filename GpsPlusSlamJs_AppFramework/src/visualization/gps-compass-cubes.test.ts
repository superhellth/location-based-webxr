/**
 * Unit tests for gps-compass-cubes module.
 *
 * Why these tests matter:
 * The GPS compass cubes provide visual orientation indicators
 * (N, E, S, W colored cubes with text labels) so users can
 * understand how the AR space is oriented relative to GPS space.
 * They are children of the CameraFollower and must be positioned
 * correctly per the NUE convention (X=North, Y=Up, Z=East).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';

import {
  createGpsCompassCubes,
  COMPASS_CUBE_SIZE,
  COMPASS_CUBE_DISTANCE,
  type GpsCompassCubes,
} from './gps-compass-cubes.js';

describe('GpsCompassCubes', () => {
  let parent: THREE.Object3D;
  let compass: GpsCompassCubes;

  beforeEach(() => {
    parent = new THREE.Object3D();
    compass = createGpsCompassCubes(parent);
  });

  // ---- Construction & hierarchy ----

  it('attaches a container group to the parent', () => {
    expect(parent.children.length).toBe(1);
    expect(compass.group.parent).toBe(parent);
  });

  it('container group is named "gps-compass-cubes"', () => {
    expect(compass.group.name).toBe('gps-compass-cubes');
  });

  // ---- Cube positions (NUE: X=North, Y=Up, Z=East) ----

  it('has a red cube at (DISTANCE, 0, 0) for North', () => {
    const north = compass.group.getObjectByName('compass-north');
    expect(north).toBeDefined();
    expect(north!.position.x).toBeCloseTo(COMPASS_CUBE_DISTANCE, 5);
    expect(north!.position.y).toBeCloseTo(0, 5);
    expect(north!.position.z).toBeCloseTo(0, 5);
  });

  it('has a blue cube at (0, 0, DISTANCE) for East', () => {
    const east = compass.group.getObjectByName('compass-east');
    expect(east).toBeDefined();
    expect(east!.position.x).toBeCloseTo(0, 5);
    expect(east!.position.y).toBeCloseTo(0, 5);
    expect(east!.position.z).toBeCloseTo(COMPASS_CUBE_DISTANCE, 5);
  });

  it('has a dimmer cube at (-DISTANCE, 0, 0) for South', () => {
    const south = compass.group.getObjectByName('compass-south');
    expect(south).toBeDefined();
    expect(south!.position.x).toBeCloseTo(-COMPASS_CUBE_DISTANCE, 5);
    expect(south!.position.y).toBeCloseTo(0, 5);
    expect(south!.position.z).toBeCloseTo(0, 5);
  });

  it('has a dimmer cube at (0, 0, -DISTANCE) for West', () => {
    const west = compass.group.getObjectByName('compass-west');
    expect(west).toBeDefined();
    expect(west!.position.x).toBeCloseTo(0, 5);
    expect(west!.position.y).toBeCloseTo(0, 5);
    expect(west!.position.z).toBeCloseTo(-COMPASS_CUBE_DISTANCE, 5);
  });

  it('has a green cube at (0, DISTANCE, 0) for Up', () => {
    const up = compass.group.getObjectByName('compass-up');
    expect(up).toBeDefined();
    expect(up!.position.x).toBeCloseTo(0, 5);
    expect(up!.position.y).toBeCloseTo(COMPASS_CUBE_DISTANCE, 5);
    expect(up!.position.z).toBeCloseTo(0, 5);
  });

  // ---- Colors ----

  it('North cube is red (0xff0000)', () => {
    const north = compass.group.getObjectByName('compass-north') as THREE.Mesh;
    const mat = north.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xff0000);
  });

  it('East cube is blue (0x0000ff)', () => {
    const east = compass.group.getObjectByName('compass-east') as THREE.Mesh;
    const mat = east.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x0000ff);
  });

  it('Up cube is green (0x00ff00)', () => {
    const up = compass.group.getObjectByName('compass-up') as THREE.Mesh;
    const mat = up.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0x00ff00);
  });

  // ---- Cube geometry size ----

  it('exported COMPASS_CUBE_SIZE is 0.1', () => {
    expect(COMPASS_CUBE_SIZE).toBe(0.1);
  });

  it('exported COMPASS_CUBE_DISTANCE is 1', () => {
    expect(COMPASS_CUBE_DISTANCE).toBe(1);
  });

  // ---- Text labels on cardinal cubes ----

  it('North cube has a text label child named "label-N"', () => {
    const north = compass.group.getObjectByName('compass-north')!;
    const label = north.getObjectByName('label-N');
    expect(label).toBeDefined();
    expect(label).toBeInstanceOf(THREE.Sprite);
  });

  it('East cube has a text label child named "label-E"', () => {
    const east = compass.group.getObjectByName('compass-east')!;
    const label = east.getObjectByName('label-E');
    expect(label).toBeDefined();
    expect(label).toBeInstanceOf(THREE.Sprite);
  });

  it('South cube has a text label child named "label-S"', () => {
    const south = compass.group.getObjectByName('compass-south')!;
    const label = south.getObjectByName('label-S');
    expect(label).toBeDefined();
    expect(label).toBeInstanceOf(THREE.Sprite);
  });

  it('West cube has a text label child named "label-W"', () => {
    const west = compass.group.getObjectByName('compass-west')!;
    const label = west.getObjectByName('label-W');
    expect(label).toBeDefined();
    expect(label).toBeInstanceOf(THREE.Sprite);
  });

  it('Up cube does NOT have a text label (color alone suffices)', () => {
    const up = compass.group.getObjectByName('compass-up')!;
    const hasLabel = up.children.some((c) => c.name.startsWith('label-'));
    expect(hasLabel).toBe(false);
  });

  // ---- dispose ----

  it('dispose removes compass group from parent', () => {
    expect(parent.children).toContain(compass.group);
    compass.dispose();
    expect(parent.children).not.toContain(compass.group);
  });

  // Why this test matters: text-label sprites have their own SpriteMaterial
  // and CanvasTexture. If dispose() only cleans up direct children, these
  // nested resources leak, degrading performance in long-running AR sessions.
  it('dispose cleans up sprite materials and textures from text labels', () => {
    // Collect all sprite materials and their textures before dispose
    const disposeSpies: ReturnType<typeof vi.spyOn>[] = [];
    compass.group.traverse((obj) => {
      if (obj instanceof THREE.Sprite) {
        const mat = obj.material;
        disposeSpies.push(vi.spyOn(mat, 'dispose'));
        if (mat.map) {
          disposeSpies.push(vi.spyOn(mat.map, 'dispose'));
        }
      }
    });

    // Sanity: 4 sprites × 2 (material + texture) = 8 spies
    expect(disposeSpies.length).toBe(8);

    compass.dispose();

    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalledOnce();
    }
  });
});
