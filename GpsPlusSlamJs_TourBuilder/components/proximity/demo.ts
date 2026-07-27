/**
 * Standalone demo for component 4 (TASK.md §2.3): replay a real Task 1 walk
 * top-down and watch each waypoint's zone change as the recorded position moves
 * — no phone, no Three.js renderer (plan Q13). The walk path is precomputed from
 * the recording into `demo-walk.json` (a few KB) so the page stays tiny; the
 * waypoints are synthesized from the path exactly as the replay e2e does.
 *
 * This is a *view* of the pure machine: it calls the same `step()` the app uses
 * and only draws the result, proving the hysteresis claim visually — a dot
 * sitting on a ring does not flicker between colours.
 */

import { Vector3 } from "three";

import {
  step,
  type ProximityObject,
  type ZoneMap,
} from "./core/proximity-machine.js";
import type { ZoneState } from "../../store/types.js";
import walk from "./demo-walk.json";

const HYSTERESIS_FRACTION = 0.15; // contract D16 default (would live in config.ts)
const PREFETCH_R = 25;
const ACTIVE_R = 10;

const ZONE_COLOR: Record<ZoneState, string> = {
  IDLE: "#6b7280",
  PREFETCHING: "#f59e0b",
  ACTIVE: "#34d399",
};

const path: Vector3[] = walk.path.map(([x, z]) => new Vector3(x, 0, z));

/** Waypoints synthesized from the path (same recipe as the replay e2e). */
interface DemoWaypoint extends ProximityObject {
  readonly label: string;
}
function wp(label: string, x: number, z: number): DemoWaypoint {
  return {
    id: label,
    label,
    position: new Vector3(x, 0, z),
    prefetchRadius: PREFETCH_R,
    activeRadius: ACTIVE_R,
  };
}
const a = path[Math.floor(path.length * 0.3)]!;
const b = path[Math.floor(path.length * 0.7)]!;
const mid = path[Math.floor(path.length * 0.5)]!;
const waypoints: DemoWaypoint[] = [
  wp("pass-a", a.x, a.z),
  wp("pass-b", b.x, b.z),
  wp("near-miss", mid.x, mid.z + 17),
];

const CONFIG = { hysteresisFraction: HYSTERESIS_FRACTION };

/** Replay samples 0..index and return the zones there plus the full edge log. */
function computeUpTo(index: number): { zones: ZoneMap; log: string[] } {
  let prev: ZoneMap = Object.fromEntries(waypoints.map((w) => [w.id, "IDLE"]));
  const log: string[] = [];
  for (let i = 0; i <= index; i++) {
    const r = step(prev, path[i]!, waypoints, CONFIG);
    for (const t of r.transitions) {
      log.push(`sample ${String(i).padStart(3)}  ${t.id}  ${t.from} → ${t.to}`);
    }
    prev = r.zones;
  }
  return { zones: prev, log };
}

// ── World → screen fitting ────────────────────────────────────────────────────
const PAD = 24;
const bounds = (() => {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  const include = (x: number, z: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (const p of path) include(p.x, p.z);
  for (const w of waypoints) {
    include(w.position.x - w.prefetchRadius, w.position.z - w.prefetchRadius);
    include(w.position.x + w.prefetchRadius, w.position.z + w.prefetchRadius);
  }
  return { minX, maxX, minZ, maxZ };
})();

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const scrub = document.getElementById("scrub") as HTMLInputElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const readout = document.getElementById("readout") as HTMLSpanElement;
const logEl = document.getElementById("log") as HTMLPreElement;

scrub.max = String(path.length - 1);

let view = { scale: 1, offX: 0, offY: 0 };
function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanZ = bounds.maxZ - bounds.minZ || 1;
  const scale = Math.min((w - 2 * PAD) / spanX, (h - 2 * PAD) / spanZ);
  view = {
    scale,
    offX: (w - spanX * scale) / 2 - bounds.minX * scale,
    offY: (h - spanZ * scale) / 2 - bounds.minZ * scale,
  };
}
function sx(x: number): number {
  return x * view.scale + view.offX;
}
function sy(z: number): number {
  return z * view.scale + view.offY;
}

function draw(index: number, zones: ZoneMap): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // Full path (faint) + travelled portion (bright).
  const line = (from: number, to: number, color: string, width: number) => {
    ctx.beginPath();
    ctx.moveTo(sx(path[from]!.x), sy(path[from]!.z));
    for (let i = from + 1; i <= to; i++)
      ctx.lineTo(sx(path[i]!.x), sy(path[i]!.z));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  line(0, path.length - 1, "#243049", 1.5);
  if (index > 0) line(0, index, "#4f6fae", 2);

  // Waypoints: two rings + a labelled dot coloured by zone.
  for (const wpt of waypoints) {
    const cx = sx(wpt.position.x);
    const cy = sy(wpt.position.z);
    const zone = zones[wpt.id] ?? "IDLE";
    const ring = (r: number, dash: number[]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * view.scale, 0, Math.PI * 2);
      ctx.setLineDash(dash);
      ctx.strokeStyle = "rgb(255 255 255 / 22%)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    ring(wpt.prefetchRadius, [4, 4]);
    ring(wpt.activeRadius, []);
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = ZONE_COLOR[zone];
    ctx.fill();
    ctx.fillStyle = "#cdd7ea";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`${wpt.label} · ${zone}`, cx + 10, cy - 8);
  }

  // User position.
  const p = path[index]!;
  ctx.beginPath();
  ctx.arc(sx(p.x), sy(p.z), 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

let current = 0;
function render(): void {
  const { zones, log } = computeUpTo(current);
  draw(current, zones);
  readout.textContent = `${current} / ${path.length - 1}`;
  scrub.value = String(current);
  logEl.textContent = log.length ? log.join("\n") : "(no transitions yet)";
  logEl.scrollTop = logEl.scrollHeight;
}

// ── Playback ──────────────────────────────────────────────────────────────────
let playing = false;
let lastT = 0;
const SAMPLES_PER_SEC = 25;
function tick(t: number): void {
  if (!playing) return;
  if (t - lastT >= 1000 / SAMPLES_PER_SEC) {
    lastT = t;
    if (current < path.length - 1) {
      current++;
      render();
    } else {
      stop();
      return;
    }
  }
  requestAnimationFrame(tick);
}
function play(): void {
  if (current >= path.length - 1) current = 0;
  playing = true;
  playBtn.textContent = "❚❚ Pause";
  lastT = performance.now();
  requestAnimationFrame(tick);
}
function stop(): void {
  playing = false;
  playBtn.textContent = "▶ Play";
}
playBtn.addEventListener("click", () => (playing ? stop() : play()));
scrub.addEventListener("input", () => {
  stop();
  current = Number(scrub.value);
  render();
});
window.addEventListener("resize", () => {
  fit();
  render();
});

fit();
render();
