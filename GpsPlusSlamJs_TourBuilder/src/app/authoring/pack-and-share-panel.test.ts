// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import type * as StorageModule from "gps-plus-slam-app-framework/storage";

vi.mock("gps-plus-slam-app-framework/storage", async () => {
  const actual = await vi.importActual<typeof StorageModule>(
    "gps-plus-slam-app-framework/storage",
  );
  return {
    ...actual,
    normalizeShareUrl: (raw: string) => raw,
    downloadZip: vi.fn(async () => {}),
  };
});

vi.mock("../../components/packaging/core/generate-qr.js", () => ({
  generateQr: vi.fn((url: string) => Promise.resolve(`QR-DATA(${url})`)),
}));

vi.mock("../../components/packaging/view/qr-view.js", () => ({
  renderQrSvg: vi.fn((host: HTMLElement, data: string) => {
    host.textContent = String(data);
  }),
}));

import { mountPackAndSharePanel } from "./pack-and-share-panel.js";
import type { Tour } from "../../store/types.js";

const fakeTour = {} as Tour;

function setup() {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const panel = mountPackAndSharePanel(root, {
    tour: fakeTour,
    assetFiles: new Map(),
  });
  const urlInputs = root.querySelectorAll<HTMLInputElement>('input[type="url"]');
  const zipUrlInput = urlInputs[1]!;
  const notesEl = root.querySelector<HTMLParagraphElement>(
    '[data-testid="url-notes"]',
  )!;
  const qrStatus = root.querySelector<HTMLParagraphElement>(
    '[data-testid="qr-status"]',
  )!;
  const generateButton = root.querySelector<HTMLButtonElement>(
    '[data-testid="generate-qr"]',
  )!;
  return { root, panel, zipUrlInput, notesEl, qrStatus, generateButton };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("mountPackAndSharePanel — proxy routing", () => {
  it("shows no note and builds the link unchanged for an ordinary host", async () => {
    const { zipUrlInput, notesEl, qrStatus, generateButton } = setup();
    zipUrlInput.value = "https://example.com/tour.zip";
    generateButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(notesEl.textContent).toBe("");
    expect(qrStatus.textContent).toContain(
      encodeURIComponent("https://example.com/tour.zip"),
    );
  });

  it("routes a Dropbox URL through the dev proxy and shows the note", async () => {
    const original = import.meta.env.DEV;
    (import.meta.env as { DEV: boolean }).DEV = true;
    try {
      const { zipUrlInput, notesEl, qrStatus, generateButton } = setup();
      const raw = "https://dl.dropboxusercontent.com/scl/fi/abc/tour.zip";
      zipUrlInput.value = raw;
      generateButton.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(notesEl.textContent).toContain("routed via dev proxy");
      expect(qrStatus.textContent).toContain(
        encodeURIComponent(`/tour-proxy?u=${encodeURIComponent(raw)}`),
      );
    } finally {
      (import.meta.env as { DEV: boolean }).DEV = original;
    }
  });

  it("still rejects an invalid URL before calling prepareHostedZipUrl", async () => {
    const { zipUrlInput, notesEl, qrStatus, generateButton } = setup();
    zipUrlInput.value = "not-a-url";
    generateButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(qrStatus.textContent).toBe("Enter a valid hosted ZIP URL first.");
    expect(notesEl.textContent).toBe("");
  });
});
