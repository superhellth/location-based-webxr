/**
 * The clickable cylindrical billboard (view layer / composition unit).
 *
 * Composes the pure pieces into one Three.js object: a textured sprite plane
 * plus the in-world transport panel below it, both yawing to face the user
 * (billboard math), with an audio element driven by the transport reducer.
 *
 * It is fed ready resources (a loaded `THREE.Texture` and an `HTMLAudioElement`)
 * — the demo/app owns loading — which is exactly the seam component 8 reuses,
 * swapping the plane for a GLTF model and the element for an asset-provider URL.
 *
 * `applyState` is this billboard's slice of the reconcile step: it shows/hides
 * and redraws its panel and nudges its audio element toward the model
 * (play/pause, and a seek when the playhead and model diverge — i.e. a click
 * restart or a bar seek). `faceCamera` runs every frame from the render loop.
 */
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Texture,
  type Vector3,
} from "three";
import { disposeObject3D } from "gps-plus-slam-app-framework/visualization";

import { computeBillboardYaw, type HorizontalPoint } from "./billboard-math.js";
import { createAudioPlayer } from "./audio-player.js";
import { createTransportPanel } from "./transport-panel-view.js";
import {
  isActive,
  isPlaying,
  type TransportState,
} from "./playback-transport.js";

/** Stamped onto each pickable mesh so the raycaster can classify a hit. */
export interface BillboardUserData {
  readonly billboardId: string;
  readonly role: "sprite" | "panel";
}

export interface ClickableBillboard {
  readonly id: string;
  readonly group: Group;
  /** Meshes the raycaster should test (sprite + panel). */
  readonly pickTargets: readonly Mesh[];
  faceCamera(cameraWorldPosition: HorizontalPoint): void;
  applyState(state: TransportState): void;
  dispose(): void;
}

const SPRITE_SIZE = 1;
const PANEL_WIDTH = 1.15;
const PANEL_HEIGHT = 0.4;
const PANEL_Y_OFFSET = -0.9;
// Re-seek the audio element only when it drifts this far from the model, so the
// ~4 Hz `timeupdate` feedback never fights normal playback (it only fires on a
// click restart or a deliberate seek).
const SEEK_SYNC_EPSILON_SEC = 0.3;

export function createClickableBillboard(options: {
  readonly id: string;
  readonly position: Vector3;
  readonly texture: Texture;
  readonly audio: HTMLAudioElement;
  readonly onTick: (
    id: string,
    positionSec: number,
    durationSec: number,
  ) => void;
  readonly onEnded: (id: string) => void;
}): ClickableBillboard {
  const { id } = options;
  const group = new Group();
  group.position.copy(options.position);

  const spriteMesh = new Mesh(
    new PlaneGeometry(SPRITE_SIZE, SPRITE_SIZE),
    new MeshBasicMaterial({ map: options.texture, transparent: true }),
  );
  spriteMesh.userData = {
    billboardId: id,
    role: "sprite",
  } satisfies BillboardUserData;

  const panel = createTransportPanel(PANEL_WIDTH, PANEL_HEIGHT);
  panel.mesh.position.set(0, PANEL_Y_OFFSET, 0);
  panel.mesh.visible = false; // only shown for the active billboard
  panel.mesh.userData = {
    billboardId: id,
    role: "panel",
  } satisfies BillboardUserData;

  group.add(spriteMesh, panel.mesh);

  const player = createAudioPlayer(options.audio, {
    onTick: (positionSec, durationSec) =>
      options.onTick(id, positionSec, durationSec),
    onEnded: () => options.onEnded(id),
  });

  function faceCamera(cameraWorldPosition: HorizontalPoint): void {
    // Yaw the whole group: the panel sits on the group's Y axis, so a Y
    // rotation keeps it directly below the sprite while both face the camera.
    group.rotation.set(
      0,
      computeBillboardYaw(group.position, cameraWorldPosition),
      0,
    );
  }

  function applyState(state: TransportState): void {
    const active = isActive(state, id);
    panel.mesh.visible = active;
    if (!active) {
      if (!player.paused) {
        player.pause();
      }
      return;
    }
    panel.redraw(state, id);
    if (
      Math.abs(player.currentTime - state.positionSec) > SEEK_SYNC_EPSILON_SEC
    ) {
      player.seekToSeconds(state.positionSec);
    }
    const shouldPlay = isPlaying(state, id);
    if (shouldPlay && player.paused) {
      player.play();
    } else if (!shouldPlay && !player.paused) {
      player.pause();
    }
  }

  return {
    id,
    group,
    pickTargets: [spriteMesh, panel.mesh],
    faceCamera,
    applyState,
    dispose(): void {
      player.dispose();
      // Sprite GPU resources via the framework util; the panel owns its own
      // canvas-texture disposal.
      disposeObject3D(spriteMesh);
      panel.dispose();
    },
  };
}
