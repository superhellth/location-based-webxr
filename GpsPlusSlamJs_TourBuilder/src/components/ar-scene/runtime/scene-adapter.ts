/**
 * The `SceneAdapter` port — the single seam between orchestration and rendering
 * (plan A20).
 *
 * Everything in `runtime/` talks to the scene through this interface and never
 * imports THREE at runtime, which is what lets the replay e2e drive the real
 * store, the real proximity driver and the real orchestrator against a fake
 * adapter — in Node, with no WebGL. `view/three-scene-adapter.ts` is the one
 * real implementation.
 *
 * Handles are deliberately opaque. A port that handed back `THREE.Object3D`
 * would leak the rendering layer straight back into the orchestrator and buy
 * nothing.
 *
 * `Vector3` is imported **type-only** (the same trick component 4's pure core
 * uses): positions are produced by the adapter and passed through, never
 * constructed here, so `runtime/` carries zero runtime dependency on THREE.
 *
 * @see plans/2026-07-31-ar-scene-plan.md §4.3
 */

import type { Vector3 } from "three";

import type { TourCoord } from "../../../store/types.js";

/** A waypoint's anchored root in the scene graph. */
export interface WaypointHandle {
  readonly waypointId: string;
}

/** A parsed, GPU-resident model/sprite template — shared by clones (A9). */
export interface TemplateHandle {
  readonly templateId: string;
}

/** One waypoint's instance of a template (a clone), attached under its root. */
export interface VisualHandle {
  readonly visualId: string;
}

/** What the visitor tapped, classified by the adapter's ray source. */
export interface TapHit {
  readonly waypointId: string;
  /** `"visual"` = the knight itself; `"transcript"` = the text panel. */
  readonly role: "visual" | "transcript";
}

export interface SceneAdapter {
  // ── Anchoring (A1) ────────────────────────────────────────────────────────
  /** Create the waypoint's anchored root. The adapter owns `createGpsAnchor`. */
  createWaypointRoot(id: string, coord: TourCoord): WaypointHandle;
  destroyWaypointRoot(handle: WaypointHandle): void;
  /**
   * Has the anchor left its bootstrap phase? An anchor still accumulating GPS
   * samples has a provisional position, and activating a knight on it would put
   * him tens of metres away (A19).
   */
  isAnchored(handle: WaypointHandle): boolean;
  getWorldPosition(handle: WaypointHandle): Vector3 | null;

  /**
   * Convert breadcrumb coordinates to world space **without** anchoring them —
   * the trail window has to know where points are before deciding which few
   * deserve an orb. `null` per entry when no alignment/zero-reference exists yet.
   */
  toWorldPositions(coords: readonly TourCoord[]): readonly (Vector3 | null)[];

  /** The visitor's live world-space pose, read from the framework (contract D11). */
  getUserPosition(): Vector3 | null;

  /** Place the ≤ pool-size orbs (A3). Slots holding `null` are hidden. */
  setOrbCoords(coords: readonly (TourCoord | null)[]): void;

  // ── Visuals: template (shared, LRU'd) vs instance (per waypoint) ───────────
  /** Fetch-free: parse the asset at `url` into a shared template. Async + heavy. */
  buildTemplate(kind: "model" | "sprite", url: string): Promise<TemplateHandle>;
  /** Free the template's GPU resources. Called on LRU eviction only (A9). */
  disposeTemplate(template: TemplateHandle): void;
  /** Clone the template under the waypoint's root, INVISIBLE (§2.5.3). */
  instantiate(handle: WaypointHandle, template: TemplateHandle): VisualHandle;
  /** Procedural stand-in when an asset is missing or corrupt (§7.2 soft-fail). */
  buildFallbackVisual(handle: WaypointHandle): VisualHandle;
  /** Detach + drop this clone. Never deep-disposes shared resources (A10). */
  releaseVisual(visual: VisualHandle): void;
  setVisible(visual: VisualHandle, visible: boolean): void;

  // ── Transcript (component 2, A14/A15) ─────────────────────────────────────
  showTranscript(handle: WaypointHandle, text: string): void;
  hideTranscript(handle: WaypointHandle): void;
  disposeTranscript(handle: WaypointHandle): void;
  /** Page the shown transcript after a tap on its controls. */
  pageTranscript(handle: WaypointHandle): void;

  // ── Audio (component 1's player, A16/A17) ─────────────────────────────────
  playAudio(handle: WaypointHandle, url: string): void;
  pauseAudio(): void;
  resumeAudio(): void;
  stopAudio(): void;
  /** `true` when the injected `AudioListener`'s context is running (A16). */
  isAudioReady(): boolean;

  // ── Interaction (A11/A12) ─────────────────────────────────────────────────
  /** Replace the raycast target set. Only ACTIVE visuals belong in it. */
  setPickTargets(handles: readonly WaypointHandle[]): void;
  onTap(listener: (hit: TapHit) => void): () => void;
  onAudioEnded(listener: () => void): () => void;

  /** Per-frame view work the orchestrator does not model (billboard yaw, …). */
  update(dtSeconds: number): void;
  dispose(): void;
}
