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
  FETCH_RES,
  loadTiles,
  enuFrameAt,
  buildBuildings,
  type BuildingVolume,
  type OsmDataSource,
  type OsmFeature,
} from "gps-plus-slam-osm";
import { latLngToCell } from "h3-js";
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
 * The GUARANTEE, not a fetch parameter any more (see `load()`'s comment on
 * why a radius-driven multi-tile fetch was dropped, 2026-08-28). A single
 * `FETCH_RES` (7) H3 tile has a ~1406 m edge (h3-js
 * `getHexagonEdgeLengthAvg(7, "m")`), so fetching just the tile that
 * contains the origin already covers at least this radius on every side —
 * comfortably, since 1406 m >> 300 m. Kept as a named, tested constant so
 * that guarantee stays visible and machine-checked rather than an
 * unexplained "one tile is enough" assumption.
 */
export const DEFAULT_OSM_BUILDING_RADIUS_M = 300;

/**
 * `DEFAULT_OSM_BUILDING_RADIUS_M` spans multiple fetch tiles (7 for the
 * default 300m around a real origin), and `area-loader.ts`'s `loadTiles`
 * fetches them SEQUENTIALLY on purpose (dedup/rate-limit reasoning lives
 * there), not the single-tile latency the original 20s figure was based on.
 * Measured against live Overpass (Munich, 300m, 2026-08-28): 7/7 tiles
 * succeeded, zero retries, zero rate-limiting, in 86s total — so a 20s
 * timeout aborted every real load before it could finish, which is what
 * "buildings never appear" actually was. 120s comfortably covers that
 * measurement with headroom; a walkable preview still starts immediately
 * either way (buildings pop in later, or don't) — only the odds of them
 * appearing at all changes.
 */
export const DEFAULT_OSM_BUILDING_TIMEOUT_MS = 120_000;

const OSM_BUILDING_USER_AGENT =
  "gps-plus-slam-tour-builder-desktop-preview (github.com/cs-util-com/location-based-webxr)";

export interface OsmBuildingLayerOptions {
  /** The tour's origin. TourBuilder's own `lat`/`lon` shape (not `lng`). */
  readonly origin: { readonly lat: number; readonly lon: number };
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
      // A single FETCH_RES tile (~1406m edge, see DEFAULT_OSM_BUILDING_RADIUS_M's
      // doc) already covers this well beyond a 300m preview radius. Deliberately
      // NOT ensureAreaLoaded(origin, radiusM, ...): that always rounds any
      // non-zero radius up to a full 1-ring (7-tile) disk (`tilesWithin`'s
      // `Math.ceil`), which fired 7 sequential Overpass requests per preview
      // session — measured 86s end to end, and repeated dev-server reloads
      // tripped public Overpass's per-client rate limit (429s). One tile is a
      // ~7x cut in request volume for the same effective coverage.
      const tile = latLngToCell(origin.lat, origin.lng, FETCH_RES);
      const { loaded } = await loadTiles(source, [tile], {
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
