/**
 * The one real `SceneAdapter` — Three.js on one side, the port on the other
 * (plan A20).
 *
 * Everything THREE-specific in component 8 lives here or in this folder:
 * anchoring, GLTF parsing and cloning, billboard yaw, the orb pool, the
 * transcript label, the audio player and the ray source. The orchestrator in
 * `runtime/` sees none of it.
 *
 * Framework specifics are **injected** rather than imported: `createAnchor`,
 * `toWorld` and `getUserWorldPos` are the three seams where the framework's
 * GPS/alignment machinery would otherwise leak in. That is what lets the demo
 * run the very same adapter with an identity anchor factory on a desktop, with
 * no GPS zero reference and no alignment matrix in sight (plan A23).
 *
 * Reuse, not reimplementation: the audio player and its `PositionalAudio`
 * spatialisation come from component 1, the transcript from component 2, the
 * yaw math from `components/shared/billboard-math`.
 */

import type { Object3D } from "three";
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  ConeGeometry,
  Vector3,
  type AudioListener,
  type Camera,
  type Intersection,
} from "three";

import type { TourCoord } from "../../../store/types.js";
import { computeBillboardYaw } from "../../shared/billboard-math.js";
import {
  createAudioPlayer,
  type AudioPlayer,
} from "../../billboard/view/audio-player.js";
import {
  createInWorldText,
  type InWorldText,
} from "../../in-world-text/view/in-world-text.js";
import type {
  SceneAdapter,
  TapHit,
  TemplateHandle,
  VisualHandle,
  WaypointHandle,
} from "../runtime/scene-adapter.js";
import { transcriptOffset, TRANSCRIPT_PANEL_WIDTH_M } from "../config.js";
import { createListenerSet } from "../core/listener-set.js";
import {
  disposeTemplate,
  instantiateTemplate,
  parseTemplate,
  releaseInstance,
  type ParsedTemplate,
} from "./gltf-loading.js";
import {
  createBreadcrumbOrbs,
  type BreadcrumbOrbs,
  type OrbAnchor,
} from "./breadcrumb-orbs.js";
import {
  createPointerRaySource,
  createXrSelectRaySource,
  type RaySource,
  type TargetRayMatrixSource,
  type XrSessionLike,
} from "./ray-sources.js";

/** What this adapter needs from a GPS anchor (the framework's `GpsAnchor`). */
export interface SceneAnchor extends OrbAnchor {
  readonly isFullyAnchored: boolean;
}

type AnchorFactory = (object3D: Object3D, coord: TourCoord) => SceneAnchor;

/** Stamped on pickable meshes so a raycast hit can be classified. */
interface ArSceneUserData {
  readonly arScene: {
    readonly waypointId: string;
    readonly role: TapHit["role"];
  };
}

export interface ThreeSceneAdapterOptions {
  /** The `arWorldGroup` (or any world-space parent in replay mode). */
  readonly parent: Object3D;
  readonly camera: Camera;
  /** Must already be running — component 8 never unlocks it (plan A16). */
  readonly audioListener: AudioListener;
  /** Wraps `createGpsAnchor`; the demo injects an identity implementation. */
  readonly createAnchor: AnchorFactory;
  /** Geo → world without anchoring, for the trail window (plan A3). */
  readonly toWorld: (coord: TourCoord) => Vector3 | null;
  /** The visitor's live world-space pose, in the same frame as the anchors. */
  readonly getUserWorldPos: () => Vector3 | null;
  readonly orbPoolSize: number;
  /** Desktop tap source. Omit when an `xrSession` is given. */
  readonly domElement?: HTMLElement;
  readonly xrSession?: XrSessionLike;
  readonly getTargetRayMatrix?: TargetRayMatrixSource;
  /** Test seam; defaults to the real GLTF/texture parse. */
  readonly parse?: typeof parseTemplate;
}

interface WaypointNode {
  readonly group: Group;
  readonly anchor: SceneAnchor;
  visual: Object3D | null;
  text: InWorldText | null;
  audio: AudioPlayer | null;
  audioElement: HTMLAudioElement | null;
}

export function createThreeSceneAdapter(
  options: ThreeSceneAdapterOptions,
): SceneAdapter {
  const parse = options.parse ?? parseTemplate;
  const nodes = new Map<string, WaypointNode>();
  const templates = new Map<string, ParsedTemplate>();
  const instances = new Map<string, { node: WaypointNode; object: Object3D }>();
  const tapListeners = createListenerSet<[TapHit]>();
  const audioEndListeners = createListenerSet<[]>();
  let pickTargets: Object3D[] = [];
  let nextTemplateId = 0;
  let nextVisualId = 0;
  /** The one story that may be playing (exclusivity is the runtime's rule). */
  let currentAudio: AudioPlayer | null = null;

  const orbs: BreadcrumbOrbs = createBreadcrumbOrbs({
    parent: options.parent,
    poolSize: options.orbPoolSize,
    anchorFactory: (object3D, coord) => options.createAnchor(object3D, coord),
  });

  /** Walk up from the hit mesh to the nearest stamped ancestor. */
  function classify(hit: Intersection<Object3D>): TapHit | null {
    let node: Object3D | null = hit.object;
    while (node !== null) {
      const stamped = (node.userData as Partial<ArSceneUserData>).arScene;
      if (stamped !== undefined) return { ...stamped };
      node = node.parent;
    }
    return null;
  }

  const raySource: RaySource =
    options.xrSession !== undefined && options.getTargetRayMatrix !== undefined
      ? createXrSelectRaySource({
          session: options.xrSession,
          getTargetRayMatrix: options.getTargetRayMatrix,
          getPickTargets: () => pickTargets,
          onHit: (hit) => {
            emitTap(hit);
          },
        })
      : createPointerRaySource({
          domElement: options.domElement!,
          camera: options.camera,
          getPickTargets: () => pickTargets,
          onHit: (hit) => {
            emitTap(hit);
          },
        });

  function emitTap(hit: Intersection<Object3D>): void {
    const classified = classify(hit);
    if (classified === null) return;
    tapListeners.emit(classified);
  }

  function stamp(
    object: Object3D,
    waypointId: string,
    role: TapHit["role"],
  ): void {
    (object.userData as Record<string, unknown>).arScene = {
      waypointId,
      role,
    };
  }

  return {
    createWaypointRoot(id: string, coord: TourCoord): WaypointHandle {
      const group = new Group();
      group.name = `waypoint-${id}`;
      options.parent.add(group);
      const anchor = options.createAnchor(group, coord);
      nodes.set(id, {
        group,
        anchor,
        visual: null,
        text: null,
        audio: null,
        audioElement: null,
      });
      return { waypointId: id };
    },

    destroyWaypointRoot(handle: WaypointHandle): void {
      const node = nodes.get(handle.waypointId);
      if (node === undefined) return;
      node.text?.dispose();
      node.audio?.dispose();
      node.anchor.dispose();
      node.group.removeFromParent();
      nodes.delete(handle.waypointId);
    },

    isAnchored(handle: WaypointHandle): boolean {
      return nodes.get(handle.waypointId)?.anchor.isFullyAnchored ?? false;
    },

    getWorldPosition(handle: WaypointHandle): Vector3 | null {
      const node = nodes.get(handle.waypointId);
      if (node === undefined) return null;
      return node.group.getWorldPosition(new Vector3());
    },

    toWorldPositions(
      coords: readonly TourCoord[],
    ): readonly (Vector3 | null)[] {
      return coords.map((coord) => options.toWorld(coord));
    },

    getUserPosition(): Vector3 | null {
      return options.getUserWorldPos();
    },

    setOrbCoords(coords: readonly (TourCoord | null)[]): void {
      orbs.setCoords(coords);
    },

    async buildTemplate(
      kind: "model" | "sprite",
      url: string,
    ): Promise<TemplateHandle> {
      const parsed = await parse(kind, url);
      const templateId = `template-${nextTemplateId++}`;
      templates.set(templateId, parsed);
      return { templateId };
    },

    disposeTemplate(template: TemplateHandle): void {
      const parsed = templates.get(template.templateId);
      if (parsed === undefined) return;
      disposeTemplate(parsed);
      templates.delete(template.templateId);
    },

    instantiate(
      handle: WaypointHandle,
      template: TemplateHandle,
    ): VisualHandle {
      const node = nodes.get(handle.waypointId);
      const parsed = templates.get(template.templateId);
      if (node === undefined || parsed === undefined) {
        return { visualId: `void-${nextVisualId++}` };
      }
      const object = instantiateTemplate(parsed);
      stamp(object, handle.waypointId, "visual");
      node.group.add(object);
      node.visual = object;
      const visualId = `visual-${nextVisualId++}`;
      instances.set(visualId, { node, object });
      return { visualId };
    },

    buildFallbackVisual(handle: WaypointHandle): VisualHandle {
      const node = nodes.get(handle.waypointId);
      if (node === undefined) return { visualId: `void-${nextVisualId++}` };
      // A plain marker cone: the visitor sees that SOMETHING is here and the
      // failure is diagnosable in the field instead of looking like empty space.
      const marker = new Mesh(
        new ConeGeometry(0.25, 1, 8),
        new MeshBasicMaterial({ color: 0xff8a5c, wireframe: true }),
      );
      marker.position.y = 0.5;
      marker.visible = false;
      stamp(marker, handle.waypointId, "visual");
      node.group.add(marker);
      node.visual = marker;
      const visualId = `fallback-${nextVisualId++}`;
      instances.set(visualId, { node, object: marker });
      return { visualId };
    },

    releaseVisual(visual: VisualHandle): void {
      const entry = instances.get(visual.visualId);
      if (entry === undefined) return;
      if (visual.visualId.startsWith("fallback-")) {
        // The fallback owns its own geometry/material — nothing shares them.
        const mesh = entry.object as Mesh;
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
      // Clones share the template's geometry/materials: detach only, NEVER a
      // recursive dispose (plan A10).
      releaseInstance(entry.object);
      if (entry.node.visual === entry.object) entry.node.visual = null;
      instances.delete(visual.visualId);
    },

    setVisible(visual: VisualHandle, isVisible: boolean): void {
      const entry = instances.get(visual.visualId);
      if (entry !== undefined) entry.object.visible = isVisible;
    },

    showTranscript(handle: WaypointHandle, text: string): void {
      const node = nodes.get(handle.waypointId);
      if (node === undefined) return;
      if (node.text === null) {
        const offset = transcriptOffset(TRANSCRIPT_PANEL_WIDTH_M);
        node.text = createInWorldText({
          text,
          id: `transcript-${handle.waypointId}`,
          position: new Vector3(offset.x, offset.y, 0),
          maxWidthMeters: TRANSCRIPT_PANEL_WIDTH_M,
        });
        stamp(node.text.pickMesh, handle.waypointId, "transcript");
        node.group.add(node.text.group);
      } else {
        node.text.setText(text);
      }
      node.text.group.visible = true;
    },

    hideTranscript(handle: WaypointHandle): void {
      const node = nodes.get(handle.waypointId);
      if (node?.text != null) node.text.group.visible = false;
    },

    disposeTranscript(handle: WaypointHandle): void {
      const node = nodes.get(handle.waypointId);
      if (node?.text == null) return;
      node.text.group.removeFromParent();
      node.text.dispose();
      node.text = null;
    },

    pageTranscript(handle: WaypointHandle): void {
      nodes.get(handle.waypointId)?.text?.next();
    },

    playAudio(handle: WaypointHandle, url: string): void {
      const node = nodes.get(handle.waypointId);
      if (node === undefined) return;
      if (node.audio === null) {
        const element = new Audio(url);
        element.crossOrigin = "anonymous";
        node.audioElement = element;
        node.audio = createAudioPlayer(element, options.audioListener, {
          onTick: () => {
            /* the transport panel is component 1's concern, not the scene's */
          },
          onEnded: () => {
            audioEndListeners.emit();
          },
        });
        // Spatialised from the waypoint's own position (component 1's tuning).
        node.group.add(node.audio.spatialNode);
      }
      currentAudio = node.audio;
      node.audio.play();
    },

    pauseAudio(): void {
      currentAudio?.pause();
    },

    resumeAudio(): void {
      currentAudio?.play();
    },

    stopAudio(): void {
      if (currentAudio === null) return;
      currentAudio.pause();
      currentAudio.seekToSeconds(0);
      currentAudio = null;
    },

    isAudioReady(): boolean {
      // A suspended context silently swallows playback, so the runtime asks
      // BEFORE starting a story and surfaces the failure (plan A16).
      return options.audioListener.context.state === "running";
    },

    setPickTargets(handles: readonly WaypointHandle[]): void {
      const targets: Object3D[] = [];
      for (const handle of handles) {
        const node = nodes.get(handle.waypointId);
        if (node === undefined) continue;
        // Only what is actually on screen: the raycaster does not skip
        // invisible objects, so a hidden mesh here would eat taps (plan A12).
        if (node.visual !== null && node.visual.visible)
          targets.push(node.visual);
        if (node.text !== null && node.text.group.visible) {
          targets.push(node.text.pickMesh);
        }
      }
      pickTargets = targets;
    },

    onTap(listener: (hit: TapHit) => void): () => void {
      return tapListeners.add(listener);
    },

    onAudioEnded(listener: () => void): () => void {
      return audioEndListeners.add(listener);
    },

    update(dtSeconds: number): void {
      const cameraPos = options.camera.getWorldPosition(new Vector3());
      for (const node of nodes.values()) {
        // Cylindrical billboarding: yaw only, never pitch or roll (component 1).
        // The text is a child of this same group at a fixed local offset, so
        // this one yaw already faces it correctly too — `InWorldText.faceCamera`
        // expects a *world* position, but the text's `group.position` here is its
        // local offset inside `node.group` (contract A14), so calling it would
        // apply a second, wrong rotation on top of this one and turn the panel
        // away from the camera instead of leaving it aligned with its parent.
        node.group.rotation.y = computeBillboardYaw(
          node.group.getWorldPosition(new Vector3()),
          cameraPos,
          node.group.rotation.y,
        );
      }
      orbs.update(dtSeconds);
    },

    dispose(): void {
      raySource.dispose();
      orbs.dispose();
      for (const id of [...nodes.keys()]) {
        const node = nodes.get(id)!;
        node.text?.dispose();
        node.audio?.dispose();
        node.anchor.dispose();
        node.group.removeFromParent();
      }
      nodes.clear();
      for (const parsed of templates.values()) disposeTemplate(parsed);
      templates.clear();
      instances.clear();
      tapListeners.clear();
      audioEndListeners.clear();
      pickTargets = [];
      currentAudio = null;
    },
  };
}
