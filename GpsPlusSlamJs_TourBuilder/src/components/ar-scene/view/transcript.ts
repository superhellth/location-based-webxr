/**
 * The transcript panel: component 2's `InWorldText`, positioned at the
 * waypoint's fixed transcript offset and stamped for tap-picking. Operates
 * directly on a looked-up `WaypointNode` — the adapter does the handle→node
 * lookup, same as it does for every other per-waypoint view module.
 */

import { Vector3 } from "three";

import { TRANSCRIPT_PANEL_WIDTH_M, transcriptOffset } from "../config.js";
import { createInWorldText } from "../../in-world-text/view/in-world-text.js";
import { stamp } from "./pick-classify.js";
import type { WaypointNode } from "./waypoint-registry.js";

export function showTranscript(node: WaypointNode, text: string): void {
  if (node.text === null) {
    const offset = transcriptOffset(TRANSCRIPT_PANEL_WIDTH_M);
    node.text = createInWorldText({
      text,
      id: `transcript-${node.waypointId}`,
      position: new Vector3(offset.x, offset.y, 0),
      maxWidthMeters: TRANSCRIPT_PANEL_WIDTH_M,
    });
    stamp(node.text.pickMesh, node.waypointId, "transcript");
    node.group.add(node.text.group);
  } else {
    node.text.setText(text);
  }
  node.text.group.visible = true;
}

export function hideTranscript(node: WaypointNode): void {
  if (node.text != null) node.text.group.visible = false;
}

export function disposeTranscript(node: WaypointNode): void {
  if (node.text == null) return;
  node.text.group.removeFromParent();
  node.text.dispose();
  node.text = null;
}

export function pageTranscript(node: WaypointNode): void {
  node.text?.next();
}
