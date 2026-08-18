/**
 * Pack + QR step of composed Authoring mode (plan
 * `plans/2026-08-14-authoring-composition-plan.md`, AC5).
 *
 * A new, small, own-UI panel built from packaging's `core/`
 * (`packTour`, `buildTourUrl`, `generateQr`), the framework's `downloadZip`,
 * and packaging's `view/renderQrSvg` — not a reuse of `components/packaging/demo.ts`'s
 * textarea/file-picker UI, which exists to let that component demo itself
 * against an arbitrary tour. Here the `Tour` + asset files already come from
 * the just-finished authoring session (component 10's `exportTour()`), so
 * this panel has exactly two jobs: pack it, and turn the URL the author
 * uploads it to into a scannable link.
 */
import type { AssetId, Tour } from "../../store/types.js";
import {
  packTour,
  PackagingError,
} from "../../components/packaging/core/pack-tour.js";
import { buildTourUrl } from "../../components/packaging/core/build-tour-url.js";
import { generateQr } from "../../components/packaging/core/generate-qr.js";
import { downloadZip } from "gps-plus-slam-app-framework/storage";
import { renderQrSvg } from "../../components/packaging/view/qr-view.js";

export interface PackAndSharePanelDeps {
  readonly tour: Tour;
  readonly assetFiles: ReadonlyMap<AssetId, File>;
}

export function mountPackAndSharePanel(
  root: HTMLElement,
  deps: PackAndSharePanelDeps,
): { destroy(): void } {
  const section = document.createElement("section");
  section.className = "panel";

  const heading = document.createElement("h2");
  heading.textContent = "Pack & share";
  section.appendChild(heading);

  const packButton = document.createElement("button");
  packButton.className = "primary";
  packButton.dataset.testid = "pack-tour";
  packButton.textContent = "Pack tour";
  section.appendChild(packButton);

  const packStatus = document.createElement("p");
  packStatus.dataset.testid = "pack-status";
  section.appendChild(packStatus);

  const appBaseLabel = document.createElement("label");
  appBaseLabel.textContent = "App base URL";
  const appBaseInput = document.createElement("input");
  appBaseInput.type = "url";
  appBaseInput.value = `${location.origin}${location.pathname}`;
  appBaseLabel.appendChild(appBaseInput);
  section.appendChild(appBaseLabel);

  const zipUrlLabel = document.createElement("label");
  zipUrlLabel.textContent = "Hosted ZIP URL (paste after upload)";
  const zipUrlInput = document.createElement("input");
  zipUrlInput.type = "url";
  zipUrlLabel.appendChild(zipUrlInput);
  section.appendChild(zipUrlLabel);

  const generateButton = document.createElement("button");
  generateButton.className = "primary";
  generateButton.dataset.testid = "generate-qr";
  generateButton.textContent = "Generate QR";
  section.appendChild(generateButton);

  const qrStatus = document.createElement("p");
  qrStatus.dataset.testid = "qr-status";
  section.appendChild(qrStatus);

  const qrHost = document.createElement("div");
  section.appendChild(qrHost);

  packButton.addEventListener("click", () => {
    void (async () => {
      packStatus.textContent = "Packing…";
      packStatus.dataset["state"] = "";
      try {
        const blob = await packTour(deps.tour, new Map(deps.assetFiles));
        await downloadZip(blob, "tour.zip");
        packStatus.textContent = `Packed tour.zip — ${blob.size.toLocaleString()} bytes.`;
        packStatus.dataset["state"] = "ok";
      } catch (error) {
        packStatus.textContent =
          error instanceof PackagingError || error instanceof Error
            ? error.message
            : String(error);
        packStatus.dataset["state"] = "error";
      }
    })();
  });

  generateButton.addEventListener("click", () => {
    void (async () => {
      qrStatus.textContent = "";
      qrStatus.dataset["state"] = "";

      // AC13: buildTourUrl only validates appBaseUrl — a garbage zipUrl would
      // otherwise silently produce a QR pointing at a broken "?tour=" link.
      let zipUrl: string;
      try {
        zipUrl = new URL(zipUrlInput.value).toString();
      } catch {
        qrStatus.textContent = "Enter a valid hosted ZIP URL first.";
        qrStatus.dataset["state"] = "error";
        return;
      }

      try {
        const url = buildTourUrl(appBaseInput.value, zipUrl);
        renderQrSvg(qrHost, await generateQr(url));
        qrStatus.textContent = url;
        qrStatus.dataset["state"] = "ok";
      } catch (error) {
        qrStatus.textContent =
          error instanceof Error ? error.message : String(error);
        qrStatus.dataset["state"] = "error";
      }
    })();
  });

  root.appendChild(section);

  return {
    destroy() {
      section.remove();
    },
  };
}
