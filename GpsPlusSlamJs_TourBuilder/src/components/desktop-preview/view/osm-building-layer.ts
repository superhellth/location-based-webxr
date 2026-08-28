/**
 * Desktop-preview-only OSM building layer.
 *
 * Fetches real OSM buildings once around a fixed origin and extrudes them
 * onto the desktop preview's flat ground — see
 * `plans/2026-08-27-desktop-preview-osm-buildings-plan.md`. Deliberately NOT
 * the incremental, terrain-aware pipeline `GpsPlusSlamJs_OsmDemo` runs: a
 * tour's preview area is small and known up front, so one bounded fetch is
 * enough and there is no worker, no terrain lattice, and no re-fetch as the
 * visitor walks.
 *
 * Never used by the real AR/phone viewing path — importing this file (and
 * therefore `gps-plus-slam-osm` + `h3-js`) outside `desktop-preview/` is
 * blocked by the dependency-cruiser boundary rule.
 */

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
} from "three";
import {
  OverpassSource,
  ensureAreaLoaded,
  enuFrameAt,
  buildBuildings,
  type BuildingVolume,
  type OsmDataSource,
  type OsmFeature,
} from "gps-plus-slam-osm";
import { disposeObject3D } from "gps-plus-slam-app-framework/visualization/three-dispose";

/**
 * `gps-plus-slam-osm` is deliberately three.js-free (plan §4.2) — it hands
 * back raw `Float32Array`/`Uint32Array` buffers (`MeshData`) and stops. This
 * is the "three lines that turn those buffers into a mesh" the package's own
 * docs say belong in the consumer (see `GpsPlusSlamJs_OsmDemo/src/mesh-layers.ts`).
 */
function toMesh(volume: BuildingVolume): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(volume.mesh.positions, 3),
  );
  geometry.setAttribute("normal", new BufferAttribute(volume.mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(volume.mesh.indices, 1));
  // A single plain material for every building, matching the preview's
  // "deliberately cheap and deliberately plain" look (`preview-session.ts`) —
  // no per-feature colouring yet.
  const material = new MeshLambertMaterial({ color: 0xb9b3a6 });
  return new Mesh(geometry, material);
}

/**
 * Small enough that a fetch stays cheap, generous enough to dress the ground
 * immediately around a tour's waypoints. Decided in conversation, not
 * measured — revisit by eye if it turns out too small/large in practice.
 */
export const DEFAULT_OSM_BUILDING_RADIUS_M = 300;

/**
 * Public Overpass instances have measured 75-130s response times with
 * frequent 504s (see gps-plus-slam-osm's `overpass-source.ts.md`). This
 * timeout is deliberately far short of that: a walkable preview starting
 * fast matters more than reliably showing buildings for what is a
 * scene-dressing nicety, not core functionality. Most loads are expected to
 * time out and leave the flat plane, and that is an accepted outcome, not a
 * bug.
 */
export const DEFAULT_OSM_BUILDING_TIMEOUT_MS = 20_000;

const OSM_BUILDING_USER_AGENT =
  "gps-plus-slam-tour-builder-desktop-preview (github.com/cs-util-com/location-based-webxr)";

export interface OsmBuildingLayerOptions {
  /** The tour's origin. TourBuilder's own `lat`/`lon` shape (not `lng`). */
  readonly origin: { readonly lat: number; readonly lon: number };
  readonly radiusM?: number;
  readonly timeoutMs?: number;
  /** Test seam. Defaults to a real `OverpassSource`. */
  readonly source?: OsmDataSource;
}

export interface OsmBuildingLayer {
  /** Added to the scene immediately; stays empty until `load()` populates it. */
  readonly group: Group;
  /**
   * Fetches and extrudes buildings once. Never rejects: any failure, empty
   * area, or timeout leaves `group` exactly as it was (empty, unless already
   * populated by a prior call).
   */
  load(): Promise<void>;
  /** Aborts an in-flight load, disposes GPU resources, clears the group. */
  dispose(): void;
}

export function createOsmBuildingLayer(
  options: OsmBuildingLayerOptions,
): OsmBuildingLayer {
  const group = new Group();
  group.name = "osm-buildings";

  const radiusM = options.radiusM ?? DEFAULT_OSM_BUILDING_RADIUS_M;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OSM_BUILDING_TIMEOUT_MS;
  const source =
    options.source ??
    new OverpassSource({ userAgent: OSM_BUILDING_USER_AGENT });
  // gps-plus-slam-osm uses `lng` (matching h3-js); TourBuilder uses `lon`
  // (contract D5) — the only place the two vocabularies meet.
  const origin = { lat: options.origin.lat, lng: options.origin.lon };

  const controller = new AbortController();
  let disposed = false;

  async function load(): Promise<void> {
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { loaded } = await ensureAreaLoaded(source, origin, radiusM, {
        signal: controller.signal,
      });
      if (disposed) return;

      const features: OsmFeature[] = loaded.flatMap((tile) => tile.features);
      const frame = enuFrameAt(origin);
      const volumes = buildBuildings(features, { frame });
      for (const volume of volumes) {
        group.add(toMesh(volume));
      }
    } catch (error) {
      // Fail soft, always — see the module doc. A slow/down Overpass
      // instance or an empty area both just mean the flat plane stays flat.
      // eslint-disable-next-line no-console
      console.warn(
        "[desktop-preview] OSM building load failed; showing flat ground.",
        error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  function dispose(): void {
    disposed = true;
    controller.abort();
    disposeObject3D(group);
    group.clear();
  }

  return { group, load, dispose };
}
