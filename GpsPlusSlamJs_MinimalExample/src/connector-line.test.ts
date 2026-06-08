import { describe, expect, it } from 'vitest';
import { BufferAttribute, Group, Scene, Vector3 } from 'three';

import { CONNECTOR_LINE_COLOR, createConnectorLine } from './connector-line.js';

/**
 * Why these tests matter: the contrast demo spawns a GPS-anchored sphere (under
 * `arWorldGroup`) and a deliberate floater cube (under `scene`) that drifts
 * apart over time. With several pairs on screen it gets hard to tell which cube
 * belongs to which sphere. A red line drawn from each sphere to its own cube
 * makes the pairing — and the growing drift — obvious.
 *
 * The line lives as a child of the sphere, so one end is always the sphere
 * origin (local `0,0,0`) and only the other end is updated each frame to the
 * cube's *current* world pose expressed in sphere-local coordinates. These
 * tests pin that single moving endpoint: it must equal the cube's world
 * position transformed into the sphere's local frame, even when the sphere and
 * cube live under different, non-trivially transformed parents (the whole point
 * — the two objects are in different frames and the line must still connect
 * their world positions).
 */
function endpoints(line: ReturnType<typeof createConnectorLine>['line']): {
  a: Vector3;
  b: Vector3;
} {
  const pos = line.geometry.getAttribute('position') as BufferAttribute;
  return {
    a: new Vector3(pos.getX(0), pos.getY(0), pos.getZ(0)),
    b: new Vector3(pos.getX(1), pos.getY(1), pos.getZ(1)),
  };
}

describe('createConnectorLine', () => {
  it('parents the line under the sphere and keeps end A at the sphere origin', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    const sphere = new Group();
    arWorldGroup.add(sphere);
    const cube = new Group();
    scene.add(cube);

    const connector = createConnectorLine({ sphere, cube });

    expect(connector.line.parent).toBe(sphere);
    expect(endpoints(connector.line).a.length()).toBeLessThan(1e-6);
  });

  it('points end B at the cube world pose expressed in sphere-local coords', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    // Non-trivial sphere parent transform so a naive copy of the cube world
    // position (ignoring the sphere frame) would be wrong.
    arWorldGroup.position.set(10, -1, 5);
    arWorldGroup.rotateY(Math.PI / 3);

    const sphere = new Group();
    sphere.position.set(0.5, 0, -0.5);
    arWorldGroup.add(sphere);

    const cube = new Group();
    cube.position.set(2, 1, 3);
    scene.add(cube);
    scene.updateMatrixWorld(true);

    const connector = createConnectorLine({ sphere, cube });
    connector.update();

    const expected = sphere.worldToLocal(cube.getWorldPosition(new Vector3()));
    expect(endpoints(connector.line).b.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('tracks the cube as it drifts (only end B moves on update)', () => {
    const scene = new Scene();
    const sphere = new Group();
    scene.add(sphere);
    const cube = new Group();
    cube.position.set(1, 0, 0);
    scene.add(cube);
    scene.updateMatrixWorld(true);

    const connector = createConnectorLine({ sphere, cube });
    connector.update();
    expect(endpoints(connector.line).b.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6);

    // The floater cube drifts away; a fresh update must follow it.
    cube.position.set(4, 2, -1);
    scene.updateMatrixWorld(true);
    connector.update();

    const after = endpoints(connector.line);
    expect(after.a.length()).toBeLessThan(1e-6); // end A never moves
    expect(after.b.distanceTo(new Vector3(4, 2, -1))).toBeLessThan(1e-6);
  });

  it('uses a red line material', () => {
    const scene = new Scene();
    const sphere = new Group();
    scene.add(sphere);
    const cube = new Group();
    scene.add(cube);

    const connector = createConnectorLine({ sphere, cube });

    expect(connector.line.material.color.getHex()).toBe(CONNECTOR_LINE_COLOR);
  });
});
