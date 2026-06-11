/**
 * Depth Unprojection
 *
 * Pure math: turn a persisted depth read (normalized view coordinates +
 * depth in meters) back into a 3D point in raw WebXR (local-floor) space
 * using the capturing view's projection matrix.
 *
 * Convention (single source of truth for NDC flips, see the 2026-06-11
 * occupancy-grid port plan §6):
 * - screenX/screenY are normalized view coordinates with a TOP-LEFT origin
 *   (screenY grows downward), exactly as fed to `getDepthInMeters`.
 * - NDC: x = 2·sx − 1, y = 1 − 2·sy (flip Y to bottom-up).
 * - View space is the WebXR camera frame: +x right, +y up, −z forward;
 *   `depthM` is the z-depth (distance along −z), not euclidean distance.
 *
 * @see depth-unprojection.ts.md for detailed documentation
 */

import { mat4, quat, vec3, vec4 } from 'gl-matrix';
import type { Matrix4, Quaternion, Vector3 } from 'gps-plus-slam-js';
import type { DepthPoint } from '../types/ar-types';

/**
 * Unproject a depth point into raw WebXR space.
 *
 * @param point - normalized view coordinates + depth in meters
 * @param cameraPos - camera position, raw WebXR (`DepthSample.cameraPos`)
 * @param cameraRot - camera quaternion [x,y,z,w], raw WebXR (`DepthSample.cameraRot`)
 * @param projectionMatrix - column-major projection matrix of the capturing
 *   view (`DepthSample.projectionMatrix`). `undefined` for recordings made
 *   before intrinsics capture — those points cannot be unprojected.
 * @returns the 3D point in raw WebXR space, or `null` when the input is not
 *   usable (missing/singular matrix, non-positive or non-finite depth,
 *   out-of-range screen coordinates).
 */
export function unprojectDepthPoint(
  point: DepthPoint,
  cameraPos: Vector3,
  cameraRot: Quaternion,
  projectionMatrix: Matrix4 | undefined
): Vector3 | null {
  if (
    !projectionMatrix ||
    projectionMatrix.length !== 16 ||
    !isUsablePoint(point)
  ) {
    return null;
  }

  const { screenX, screenY, depthM } = point;
  const proj = mat4.fromValues(
    ...(projectionMatrix as Parameters<typeof mat4.fromValues>)
  );
  const invProj = mat4.invert(mat4.create(), proj);
  if (!invProj) {
    return null; // singular matrix
  }

  // Inverse-project an arbitrary point on the pixel's ray (NDC z = -1),
  // then rescale the resulting view-space point so its z-depth is depthM.
  const ndc = vec4.fromValues(2 * screenX - 1, 1 - 2 * screenY, -1, 1);
  const view = vec4.transformMat4(vec4.create(), ndc, invProj);
  if (view[3] === 0) {
    return null;
  }
  const rayX = view[0] / view[3];
  const rayY = view[1] / view[3];
  const rayZ = view[2] / view[3];
  if (rayZ >= 0) {
    return null; // ray does not point into the view frustum (-z forward)
  }
  const scale = -depthM / rayZ;
  const viewPoint = vec3.fromValues(rayX * scale, rayY * scale, -depthM);

  // Rigid transform by the camera pose: world = rot · viewPoint + pos
  const world = vec3.transformQuat(
    vec3.create(),
    viewPoint,
    quat.fromValues(cameraRot[0], cameraRot[1], cameraRot[2], cameraRot[3])
  );
  vec3.add(world, world, vec3.fromValues(...cameraPos));

  const result: Vector3 = [world[0], world[1], world[2]];
  return result.every((v) => Number.isFinite(v)) ? result : null;
}

function isUsablePoint(point: DepthPoint): boolean {
  return (
    Number.isFinite(point.depthM) &&
    point.depthM > 0 &&
    isInUnitRange(point.screenX) &&
    isInUnitRange(point.screenY)
  );
}

function isInUnitRange(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}
