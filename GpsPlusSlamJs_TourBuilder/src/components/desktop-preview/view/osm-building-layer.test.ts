import { describe, expect, it, vi } from "vitest";
import { Mesh } from "three";
import type {
  OsmDataSource,
  OsmFeature,
  OsmTileResult,
} from "gps-plus-slam-osm";
import {
  createOsmBuildingLayer,
  DEFAULT_OSM_BUILDING_RADIUS_M,
  DEFAULT_OSM_BUILDING_TIMEOUT_MS,
} from "./osm-building-layer.js";

const ORIGIN = { lat: 50.9413, lon: 6.9583 };

/** A closed square footprint, tagged as a plain building, near ORIGIN. */
const BUILDING_FEATURE: OsmFeature = {
  type: "way",
  id: 1,
  tags: { building: "yes", height: "10" },
  geometry: [
    { lat: 50.9413, lng: 6.9583 },
    { lat: 50.94135, lng: 6.9583 },
    { lat: 50.94135, lng: 6.95835 },
    { lat: 50.9413, lng: 6.95835 },
    { lat: 50.9413, lng: 6.9583 },
  ],
};

function tileResult(features: readonly OsmFeature[]): OsmTileResult {
  return {
    tile: "test-tile",
    features,
    fetchedAt: 0,
    sourceId: "fake",
    schemaVersion: 1,
    skipped: [],
  };
}

/** Resolves every tile with the same fixed set of features. */
function resolvingSource(features: readonly OsmFeature[]): OsmDataSource {
  return {
    attribution: "test",
    sourceId: "fake-resolving",
    fetchTile: () => Promise.resolve(tileResult(features)),
  };
}

/** Rejects every tile request. */
function rejectingSource(): OsmDataSource {
  return {
    attribution: "test",
    sourceId: "fake-rejecting",
    fetchTile: () => Promise.reject(new Error("network down")),
  };
}

/** Never resolves on its own; only settles when its signal is aborted. */
function hangingSource(): OsmDataSource {
  return {
    attribution: "test",
    sourceId: "fake-hanging",
    fetchTile: (_tile: string, signal?: AbortSignal) =>
      new Promise<OsmTileResult>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  };
}

describe("createOsmBuildingLayer", () => {
  it("defaults to a 300m radius and a 120s timeout", () => {
    expect(DEFAULT_OSM_BUILDING_RADIUS_M).toBe(300);
    expect(DEFAULT_OSM_BUILDING_TIMEOUT_MS).toBe(120_000);
  });

  it("adds building meshes to the group once loaded", async () => {
    const layer = createOsmBuildingLayer({
      origin: ORIGIN,
      source: resolvingSource([BUILDING_FEATURE]),
    });

    expect(layer.group.children).toHaveLength(0);
    await layer.load();

    expect(layer.group.children.length).toBeGreaterThan(0);
    expect(layer.group.children[0]).toBeInstanceOf(Mesh);
  });

  it("fails soft: a rejecting source leaves the group empty and does not throw", async () => {
    const layer = createOsmBuildingLayer({
      origin: ORIGIN,
      source: rejectingSource(),
    });

    await expect(layer.load()).resolves.toBeUndefined();
    expect(layer.group.children).toHaveLength(0);
  });

  it("fails soft: no features in the area leaves the group empty", async () => {
    const layer = createOsmBuildingLayer({
      origin: ORIGIN,
      source: resolvingSource([]),
    });

    await layer.load();
    expect(layer.group.children).toHaveLength(0);
  });

  it("aborts and fails soft once the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      const layer = createOsmBuildingLayer({
        origin: ORIGIN,
        timeoutMs: 5_000,
        source: hangingSource(),
      });

      const pending = layer.load();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toBeUndefined();
      expect(layer.group.children).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dispose() aborts an in-flight load and clears the group", async () => {
    let sawAbort = false;
    const source: OsmDataSource = {
      attribution: "test",
      sourceId: "fake-dispose",
      fetchTile: (_tile: string, signal?: AbortSignal) =>
        new Promise<OsmTileResult>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            sawAbort = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    };
    const layer = createOsmBuildingLayer({ origin: ORIGIN, source });

    const pending = layer.load();
    layer.dispose();
    await pending;

    expect(sawAbort).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });

  it("does not add meshes if disposed while a load was already in flight", async () => {
    let resolveTile!: (result: OsmTileResult) => void;
    const source: OsmDataSource = {
      attribution: "test",
      sourceId: "fake-slow",
      fetchTile: () =>
        new Promise<OsmTileResult>((resolve) => {
          resolveTile = resolve;
        }),
    };
    const layer = createOsmBuildingLayer({ origin: ORIGIN, source });

    const pending = layer.load();
    layer.dispose();
    resolveTile(tileResult([BUILDING_FEATURE]));
    await pending;

    expect(layer.group.children).toHaveLength(0);
  });
});
