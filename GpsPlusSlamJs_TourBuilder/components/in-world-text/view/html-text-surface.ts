/**
 * The HTML-in-3D text backend (view layer) — the primary path.
 *
 * Builds an offscreen DOM subtree from the shared `PanelDrawModel` and rasterizes
 * it to a texture with `three-html-render` (which renders the DOM through an SVG
 * `<foreignObject>` on today's browsers). This is the approach the TASK asks us
 * to use first because it renders reliably inside immersive WebXR, where a
 * DOM/CSS overlay does not (plan D1/D8).
 *
 * The offscreen root is detached from layout (positioned far off-screen,
 * `aria-hidden`, `pointer-events:none`) so it never touches the visible page —
 * it exists only to be rasterized. Rasterization is asynchronous; `render`
 * double-buffers (the previous texture image stays until the new raster lands)
 * and `settled()` exposes the latest raster promise so the factory can time it
 * out and fall back to Canvas if it throws or stalls (plan R1/R2/R3). The markup
 * is self-contained (system fonts, inline styles, no cross-origin resources) so
 * the raster is never tainted (plan D3).
 */

import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";

import type {
  DrawButton,
  DrawLine,
  PanelDrawModel,
  PxRect,
} from "../core/describe-panel.js";
import type { SurfaceDeps, TextSurface } from "./text-surface.js";

/** Minimal shape we use from `three-html-render`'s `HtmlRenderer`. */
interface HtmlRasterizer {
  update(node: HTMLElement): Promise<HTMLCanvasElement>;
}

// `three-html-render` patches DOM globals at module-eval time, so it must never
// load in a non-DOM (node/vitest) context. We import it lazily on first render,
// which only happens in the browser — keeping the static import graph (and thus
// the factory's unit tests) node-safe. Memoized so the polyfill installs once.
let rasterizerPromise: Promise<HtmlRasterizer> | null = null;
function loadRasterizer(): Promise<HtmlRasterizer> {
  if (rasterizerPromise === null) {
    rasterizerPromise = import("three-html-render").then((module) => {
      module.installHtmlInCanvasPolyfill();
      return module.getHtmlRenderer();
    });
  }
  return rasterizerPromise;
}

export function createHtmlTextSurface(deps: SurfaceDeps): TextSurface {
  const root = document.createElement("div");
  styleRoot(root, deps);
  document.body.appendChild(root);

  // Placeholder image until the first raster lands; swapped in on settle.
  const texture = new CanvasTexture(document.createElement("canvas"));
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = deps.maxAnisotropy;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;

  let pending: Promise<void> = Promise.resolve();
  let token = 0;

  return {
    texture,
    render(model: PanelDrawModel): void {
      buildDom(root, model);
      const current = ++token;
      // Swallow a superseded raster's rejection; only the latest `pending` is
      // surfaced to the factory via settled().
      void pending.catch(() => undefined);
      pending = loadRasterizer()
        .then((rasterizer) => rasterizer.update(root))
        .then((rasterCanvas) => {
          if (current === token) {
            texture.image = rasterCanvas;
            texture.needsUpdate = true;
          }
        });
    },
    settled: () => pending,
    dispose(): void {
      token++;
      root.remove();
      texture.dispose();
    },
  };
}

function styleRoot(root: HTMLDivElement, deps: SurfaceDeps): void {
  root.setAttribute("aria-hidden", "true");
  const s = root.style;
  s.position = "fixed";
  s.left = "-100000px";
  s.top = "0";
  s.width = `${deps.canvasW}px`;
  s.height = `${deps.canvasH}px`;
  s.boxSizing = "border-box";
  s.pointerEvents = "none";
  s.overflow = "hidden";
}

function buildDom(root: HTMLDivElement, model: PanelDrawModel): void {
  root.replaceChildren();
  const s = root.style;
  s.background = model.panelColor;
  s.borderRadius = "28px";
  s.fontFamily = model.fontFamily;
  s.color = model.textColor;

  for (const line of model.lines) {
    root.appendChild(lineEl(line, model));
  }
  root.appendChild(buttonEl(model.prev, "prev", model));
  root.appendChild(buttonEl(model.next, "next", model));
  root.appendChild(indicatorEl(model));
}

/** Absolutely position an element over a pixel rect, contents centred. */
function positionBox(s: CSSStyleDeclaration, rect: PxRect): void {
  s.position = "absolute";
  s.left = `${rect.x}px`;
  s.top = `${rect.y}px`;
  s.width = `${rect.w}px`;
  s.height = `${rect.h}px`;
  s.display = "flex";
  s.alignItems = "center";
  s.justifyContent = "center";
}

function lineEl(line: DrawLine, model: PanelDrawModel): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = line.text;
  const s = el.style;
  s.position = "absolute";
  s.left = `${line.xPx}px`;
  s.top = `${line.yPx}px`;
  s.fontSize = `${model.fontPx}px`;
  s.lineHeight = `${model.lineHeightPx}px`;
  s.whiteSpace = "pre"; // honour our line breaks; never re-wrap
  return el;
}

function buttonEl(
  button: DrawButton,
  dir: "prev" | "next",
  model: PanelDrawModel,
): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = dir === "prev" ? "‹" : "›";
  const r = button.rectPx;
  positionBox(el.style, r);
  el.style.borderRadius = `${Math.min(r.w, r.h) * 0.28}px`;
  el.style.fontSize = `${Math.round(Math.min(r.w, r.h) * 0.6)}px`;
  el.style.background = button.enabled
    ? "rgba(79, 140, 255, 0.18)"
    : "rgba(57, 66, 79, 0.15)";
  el.style.color = button.enabled ? model.accentColor : model.mutedColor;
  return el;
}

function indicatorEl(model: PanelDrawModel): HTMLDivElement {
  const el = document.createElement("div");
  el.textContent = model.indicator.text;
  positionBox(el.style, model.indicator.rectPx);
  el.style.fontSize = `${Math.round(model.fontPx * 0.7)}px`;
  el.style.fontWeight = "600";
  return el;
}
