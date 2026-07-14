/**
 * Standalone demo for Component 5 — tour packaging + QR, no Three.js, no GPS.
 *
 * Left: the sample tour, one file input per declared asset (so it generalises to
 * any fixture, including several assets of one type), and a Pack button that
 * runs the real `packTour` and downloads the result. Picking a file rebuilds its
 * `AssetEntry.filename` through `assetFilename` — the same path the authoring UI
 * (component 10) will take.
 *
 * Right: `buildTourUrl` + `generateQr`. The built URL is printed under the code
 * so the `?tour=` encoding can be checked without a phone.
 */

import { sampleTour } from "../../store/fixtures/sample-tour.js";
import type { AssetId, Tour } from "../../store/types.js";
import { assetFilename } from "./core/asset-filename.js";
import { buildTourUrl } from "./core/build-tour-url.js";
import { generateQr } from "./core/generate-qr.js";
import { packTour } from "./core/pack-tour.js";
import { downloadBlob } from "./view/download-blob.js";
import { renderQrSvg } from "./view/qr-view.js";

const picked = new Map<AssetId, File>();

const el = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const tourState = el<HTMLPreElement>("tour-state");
const assetInputs = el<HTMLDivElement>("asset-inputs");
const packStatus = el<HTMLParagraphElement>("pack-status");
const usePlaceholders = el<HTMLInputElement>("use-placeholders");
const appBase = el<HTMLInputElement>("app-base");
const zipUrl = el<HTMLInputElement>("zip-url");
const builtUrl = el<HTMLElement>("built-url");
const qrHost = el<HTMLDivElement>("qr-host");
const qrStatus = el<HTMLParagraphElement>("qr-status");

/**
 * The sample tour with each picked file's canonical filename written back into
 * its `AssetEntry` — i.e. what the authoring slice would hold after the author
 * attached real files.
 */
function currentTour(): Tour {
  return {
    ...sampleTour,
    assets: sampleTour.assets.map((asset) => {
      const file = picked.get(asset.id);
      return file
        ? { ...asset, filename: assetFilename(asset.id, file) }
        : asset;
    }),
  };
}

/**
 * Stand-in bytes for an asset the user has not picked, named to match the
 * fixture's own filename so the entry path is unchanged. Lets the demo produce a
 * structurally real ZIP out of the box; the bytes are not a playable asset.
 * TODO: drop this once real sample assets live in `public/packaging/`.
 */
function placeholderFile(filename: string): File {
  const name = filename.split("/").at(-1) ?? "asset.bin";
  return new File([new Uint8Array(64)], name);
}

function filesForPack(tour: Tour): Map<AssetId, File> {
  const files = new Map(picked);
  if (usePlaceholders.checked) {
    for (const asset of tour.assets) {
      if (!files.has(asset.id)) {
        files.set(asset.id, placeholderFile(asset.filename));
      }
    }
  }
  return files;
}

function renderTour(): void {
  tourState.textContent = JSON.stringify(currentTour(), null, 2);
}

function renderAssetInputs(): void {
  assetInputs.replaceChildren();
  for (const asset of sampleTour.assets) {
    const row = document.createElement("label");
    row.className = "asset-row";

    const name = document.createElement("span");
    name.textContent = `${asset.id} (${asset.type})`;

    const input = document.createElement("input");
    input.type = "file";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) picked.set(asset.id, file);
      else picked.delete(asset.id);
      renderTour();
    });

    row.append(name, input);
    assetInputs.appendChild(row);
  }
}

async function packAndDownload(): Promise<void> {
  const tour = currentTour();
  try {
    const blob = await packTour(tour, filesForPack(tour));
    downloadBlob(blob, "tour.zip");
    packStatus.textContent = `Packed tour.zip — ${blob.size.toLocaleString()} bytes, ${tour.assets.length} asset(s) + tour.json, all stored.`;
    packStatus.dataset["state"] = "ok";
  } catch (error) {
    // PackagingError's message already names the missing ids / bad paths.
    packStatus.textContent =
      error instanceof Error ? error.message : String(error);
    packStatus.dataset["state"] = "error";
  }
}

async function showQr(): Promise<void> {
  try {
    const url = buildTourUrl(appBase.value, zipUrl.value);
    renderQrSvg(qrHost, await generateQr(url));
    builtUrl.textContent = url;
    qrStatus.textContent = "";
    qrStatus.dataset["state"] = "ok";
  } catch (error) {
    qrHost.replaceChildren();
    builtUrl.textContent = "";
    qrStatus.textContent =
      error instanceof Error ? error.message : String(error);
    qrStatus.dataset["state"] = "error";
  }
}

el<HTMLButtonElement>("load-sample").addEventListener("click", () => {
  renderAssetInputs();
  renderTour();
});
el<HTMLButtonElement>("pack").addEventListener("click", () => {
  void packAndDownload();
});
el<HTMLButtonElement>("generate-qr").addEventListener("click", () => {
  void showQr();
});
usePlaceholders.addEventListener("change", () => {
  packStatus.textContent = "";
});

// The app base defaults to this page: scanning the QR from the dev server round
// -trips to a real URL, so the ?tour= param can be checked end to end.
appBase.value = `${location.origin}${location.pathname}`;
renderAssetInputs();
renderTour();
