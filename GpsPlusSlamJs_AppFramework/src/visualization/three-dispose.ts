/**
 * Three.js resource dispose utilities.
 *
 * Generic GPU resource cleanup for Object3D trees and mesh arrays.
 * Handles geometries, materials, and material textures (e.g. map).
 */

import type * as THREE from 'three';

export interface DisposeOptions {
  /** When true, skip geometry.dispose() — useful for shared geometries. */
  readonly skipGeometry?: boolean;
  /** When true, skip material.dispose() (and its map texture) — useful for shared materials. */
  readonly skipMaterial?: boolean;
}

/**
 * Traverse an Object3D and all its descendants, disposing GPU resources:
 * geometries (Mesh), materials (Mesh + Sprite), and material textures.
 *
 * Does NOT remove root from its parent — callers handle that.
 *
 * @param root The Object3D tree root to clean up.
 * @param opts Optional flags (e.g. skipGeometry for shared geometries).
 */
export function disposeObject3D(
  root: THREE.Object3D,
  opts?: DisposeOptions
): void {
  const disposed = new Set<{ dispose(): void }>();

  root.traverse((object: THREE.Object3D) => {
    // Dispose geometry on Mesh instances
    if ('geometry' in object && (object as THREE.Mesh).geometry) {
      const geo = (object as THREE.Mesh).geometry;
      if (!opts?.skipGeometry && !disposed.has(geo)) {
        disposed.add(geo);
        geo.dispose();
      }
    }

    // Dispose material (and its map texture) on Mesh and Sprite instances.
    // Mesh.material can be a single Material or an array (geometry groups).
    if (!opts?.skipMaterial && 'material' in object) {
      const raw = (object as THREE.Mesh | THREE.Sprite).material;
      const materials: THREE.Material[] = Array.isArray(raw) ? raw : [raw];

      for (const mat of materials) {
        if (!mat || disposed.has(mat)) continue;
        disposed.add(mat);
        if ('map' in mat && (mat as Record<string, unknown>).map) {
          const tex = (mat as Record<string, unknown>).map as THREE.Texture;
          if (!disposed.has(tex)) {
            disposed.add(tex);
            tex.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

/**
 * Remove meshes from a parent, dispose their GPU resources, and clear
 * the array in-place.
 *
 * @param meshes Array of meshes (mutated — emptied after disposal).
 * @param parent The Object3D to remove meshes from. Pass null/undefined to skip removal.
 * @param opts   Optional flags (e.g. skipGeometry for shared geometries).
 */
export function disposeMeshArray(
  meshes: THREE.Mesh[],
  parent?: THREE.Object3D | null,
  opts?: DisposeOptions
): void {
  for (const mesh of meshes) {
    if (parent) {
      parent.remove(mesh);
    }
    disposeObject3D(mesh, opts);
  }
  meshes.length = 0;
}
