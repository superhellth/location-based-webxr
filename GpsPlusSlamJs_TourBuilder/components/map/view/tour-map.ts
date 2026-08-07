/**
 * `createTourMap` — plain 2D Leaflet map (no Three.js/CSS3D), component 7
 * (TASK.md §2.3 "2D map overview").
 *
 * Deliberately NOT a wrapper around the framework's `LeafletMapOverlay`: that
 * class embeds its Leaflet map into a THREE.Scene via a CSS3DObject for
 * in-AR-scene display, which contradicts this component's own spec line
 * ("a toggleable HTML/2D map") and its "standalone map page" demo. Documented
 * deviation — see plans/2026-07-31-map-plan.md.
 *
 * What IS reused, at the correct seam: `buildMapData`/`drawMapData` (the same
 * pure builder + drawing routine both existing recorder maps already share)
 * for the user-position dot, and the public method shapes of
 * `LeafletMapOverlay` (`setGpsPosition`, `render`, `toggle`/`show`/`hide`/
 * `isVisible`) so a future composition step could wrap this component in a
 * `CSS3DObject` the same way, without changing this file's interface.
 *
 * @see plans/2026-07-31-map-plan.md
 * @see plans/Shared-Contract.md D5
 */

import L from "leaflet";
import type { MapData } from "gps-plus-slam-app-framework/visualization/map-data";
import { drawMapData } from "gps-plus-slam-app-framework/visualization/map-overlay-draw";

import type {
  WaypointMarkerStatus,
  WaypointMarkerViewModel,
} from "../core/map-marker-state.js";

const DEFAULT_TILE_SERVER_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ZOOM = 17;
const MAX_ZOOM = 19;

/** Size (px) of an unvisited/visited waypoint marker dot. */
const MARKER_SIZE_PX = 20;
/** Size (px) of the "next" highlight — slightly larger to stand out. */
const NEXT_MARKER_SIZE_PX = 24;

const STATUS_COLOR: Record<WaypointMarkerStatus, string> = {
  unvisited: "#9ca3af", // neutral grey
  next: "#f5b400", // gold/amber highlight (visual hint only, not a gate)
  visited: "#22c55e", // green
};

export interface TourMapOptions {
  readonly tileServerUrl?: string;
  readonly onTileError?: (error: unknown) => void;
}

export interface TourMapInstance {
  /** Center the map on a GPS fix. Same name/shape as `LeafletMapOverlay`. */
  setGpsPosition(lat: number, lon: number): void;
  /** Draw the user-position dot via the shared `buildMapData`/`drawMapData` path. */
  render(data: MapData): void;
  /** Replace the waypoint marker layer wholesale (contract: realistic tour sizes only). */
  setWaypoints(markers: readonly WaypointMarkerViewModel[]): void;
  toggle(): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  /** Re-measure the container (Leaflet mis-sizes tiles if hidden at creation/toggle). */
  resize(): void;
  /** The underlying Leaflet map, or `null` after `destroy()`. */
  getLeafletMap(): L.Map | null;
  destroy(): void;
}

function buildWaypointIconHtml(status: WaypointMarkerStatus): string {
  const color = STATUS_COLOR[status];
  const size = status === "next" ? NEXT_MARKER_SIZE_PX : MARKER_SIZE_PX;
  const checkmark =
    status === "visited"
      ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;line-height:1;">✓</div>'
      : "";
  return `<div style="position:relative;background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.7);">${checkmark}</div>`;
}

export function createTourMap(
  container: HTMLElement | null,
  options: TourMapOptions = {},
): TourMapInstance | null {
  if (!container) {
    return null;
  }

  const tileServerUrl = options.tileServerUrl ?? DEFAULT_TILE_SERVER_URL;

  let leafletMap: L.Map | null = L.map(container, {
    zoomControl: true,
    attributionControl: false,
  });
  const tileLayer = L.tileLayer(tileServerUrl, { maxZoom: MAX_ZOOM });
  tileLayer.on("tileerror", (e: L.TileErrorEvent) => {
    options.onTileError?.(e.error);
  });
  tileLayer.addTo(leafletMap);

  let trajectoryLayers: L.Layer[] = [];
  let waypointMarkers: L.Marker[] = [];
  let visible = false;
  let hasCenteredOnce = false;

  // Toggleable, starts hidden (matches recorder's "map opens via a button").
  container.style.display = "none";

  function resize(): void {
    leafletMap?.invalidateSize();
  }

  return {
    setGpsPosition(lat: number, lon: number): void {
      if (!leafletMap) return;
      // Only the first fix sets the initial view (incl. zoom). Later calls
      // pan without touching zoom, so a user's manual zoom during playback
      // isn't fought on every position update.
      if (!hasCenteredOnce) {
        leafletMap.setView([lat, lon], DEFAULT_ZOOM);
        hasCenteredOnce = true;
      } else {
        leafletMap.panTo([lat, lon]);
      }
    },

    render(data: MapData): void {
      if (!leafletMap) return;
      for (const layer of trajectoryLayers) layer.remove();
      trajectoryLayers = drawMapData(leafletMap, data, {
        showUserPosition: true,
      }).layers;
    },

    setWaypoints(markers: readonly WaypointMarkerViewModel[]): void {
      if (!leafletMap) return;
      for (const marker of waypointMarkers) marker.remove();
      waypointMarkers = markers.map((m) => {
        const size = m.status === "next" ? NEXT_MARKER_SIZE_PX : MARKER_SIZE_PX;
        const anchor = size / 2;
        return L.marker([m.position.lat, m.position.lon], {
          icon: L.divIcon({
            className: "",
            html: buildWaypointIconHtml(m.status),
            iconSize: [size, size],
            iconAnchor: [anchor, anchor],
          }),
        })
          .bindPopup(m.id)
          .addTo(leafletMap!);
      });
    },

    toggle(): void {
      if (visible) {
        this.hide();
      } else {
        this.show();
      }
    },

    show(): void {
      if (visible) return;
      container.style.display = "";
      visible = true;
      requestAnimationFrame(resize);
    },

    hide(): void {
      if (!visible) return;
      container.style.display = "none";
      visible = false;
    },

    isVisible(): boolean {
      return visible;
    },

    resize,

    getLeafletMap(): L.Map | null {
      return leafletMap;
    },

    destroy(): void {
      if (!leafletMap) return;
      for (const layer of trajectoryLayers) layer.remove();
      for (const marker of waypointMarkers) marker.remove();
      trajectoryLayers = [];
      waypointMarkers = [];
      leafletMap.remove();
      leafletMap = null;
      visible = false;
    },
  };
}
