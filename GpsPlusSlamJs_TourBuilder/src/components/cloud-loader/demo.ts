/**
 * Standalone demo for Component 6 — cloud-storage tour source, no Three.js, no
 * GPS, no store. It drives the real `openRemoteTour` + `AssetProvider` against a
 * hosted `tour.zip` URL — or a share *page* link pasted straight from a cloud
 * provider, which is auto-normalized and (for known no-CORS hosts, in dev)
 * auto-routed through the built-in proxy — and shows the four beats of
 * §2.5.4/§2.5.6:
 *
 *   1. tour.json + POIs render immediately, before the whole archive downloads;
 *   2. an asset fetched by range → a 206 Partial Content in the Network panel;
 *   3. the background warm completes → the source label flips remote → local,
 *      and a further asset read issues no new request;
 *   4. a range-refusing link still works via the full-download fallback (paste
 *      a URL whose host answers 200 to a Range request — see RECIPE.md).
 *
 * Uses the browser defaults (`URL.createObjectURL`, Cache API), so it exercises
 * exactly the transport the Node suite cannot (Option B, C19).
 */

import { normalizeShareUrl } from "gps-plus-slam-app-framework/storage";

import type { AssetEntry } from "../../store/types.js";
import { TourLoadError } from "./core/errors.js";
import { openRemoteTour, type OpenedTour } from "./view/open-remote-tour.js";

/** Hosts that serve bytes but not to a cross-site *browser* — reachable only
 *  through the proxy. Dropbox sends no CORS headers at all; Google's
 *  usercontent host advertises `Access-Control-Allow-Origin: *` to plain
 *  clients but 403s any request carrying `Sec-Fetch-Site: cross-site`, which a
 *  browser always attaches. The proxy's server-side fetch sends neither. */
const PROXY_REQUIRED_HOSTS = new Set([
  "dl.dropboxusercontent.com",
  "drive.usercontent.google.com",
]);

interface PreparedUrl {
  readonly url: string;
  readonly notes: readonly string[];
}

/**
 * Turn whatever the user pasted into a fetchable `?tour=` value: share pages
 * are normalized to their raw download URL, and known no-CORS hosts are routed
 * through the dev proxy (`/tour-proxy?u=…`). In a production build there is no
 * local proxy, so the URL is left as-is with a warning — see RECIPE.md for the
 * Worker setup.
 */
function prepareTourUrl(raw: string): PreparedUrl {
  const notes: string[] = [];
  const normalized = normalizeShareUrl(raw);
  if (normalized !== raw) {
    notes.push(`share link normalized → ${normalized}`);
  }

  let host: string;
  try {
    host = new URL(normalized).hostname;
  } catch {
    return { url: normalized, notes }; // relative (e.g. already-proxied) URL
  }

  if (!PROXY_REQUIRED_HOSTS.has(host)) return { url: normalized, notes };
  if (!import.meta.env.DEV) {
    notes.push(
      `⚠ ${host} serves no CORS headers — route it through the Worker proxy (RECIPE.md)`,
    );
    return { url: normalized, notes };
  }
  const proxied = `/tour-proxy?u=${encodeURIComponent(normalized)}`;
  notes.push(`no-CORS host ${host} → routed via dev proxy`);
  return { url: proxied, notes };
}

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const logEl = $("log");
const sourceEl = $("source");

function log(message: string): void {
  logEl.textContent += `${new Date().toISOString().slice(11, 23)}  ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function previewAsset(asset: AssetEntry, url: string): void {
  const preview = $("preview");
  if (asset.type === "sprite") {
    preview.innerHTML = `<img alt="${asset.id}" src="${url}" />`;
  } else if (asset.type === "audio") {
    preview.innerHTML = `<audio controls src="${url}"></audio>`;
  } else {
    preview.innerHTML = `<a href="${url}" download="${asset.id}.glb">download ${asset.id}</a>`;
  }
}

function renderAssetButtons(opened: OpenedTour): void {
  const container = $("assets");
  container.innerHTML = "";
  for (const asset of opened.tour.assets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `getAssetUrl("${asset.id}")`;
    btn.addEventListener("click", () => {
      void (async () => {
        log(`requesting asset "${asset.id}" (${asset.type})…`);
        try {
          const url = await opened.assetProvider.getAssetUrl(asset.id);
          log(`  → Blob URL for "${asset.id}" (check Network panel for 206)`);
          previewAsset(asset, url);
        } catch (err) {
          log(`  ✗ ${asset.id} failed: ${String(err)}`);
        }
      })();
    });
    container.append(btn);
  }
}

async function load(): Promise<void> {
  const raw = $<HTMLInputElement>("url").value.trim();
  if (!raw) {
    log("enter a tour.zip URL or share link first");
    return;
  }
  const { url, notes } = prepareTourUrl(raw);
  $("tour").textContent = "";
  $("assets").innerHTML = "";
  $("preview").innerHTML = "";
  sourceEl.textContent = "remote (range)";
  for (const note of notes) log(note);
  log(`opening ${url} …`);

  let opened: OpenedTour;
  try {
    opened = await openRemoteTour(url);
  } catch (err) {
    const cause = err instanceof TourLoadError ? ` [${err.loadCause}]` : "";
    log(`✗ could not open tour${cause}: ${String(err)}`);
    sourceEl.textContent = "—";
    return;
  }

  // Beat 1: POIs available before the archive has finished downloading.
  const { tour } = opened;
  $("tour").textContent =
    `${tour.name} — ${tour.waypoints.length} waypoints, ${tour.assets.length} assets ` +
    `(POIs: ${tour.waypoints.map((w) => w.id).join(", ")})`;
  log(
    `✓ tour "${tour.name}" ready before full download — request assets below`,
  );

  // Beat 2: per-asset range fetch on demand.
  renderAssetButtons(opened);

  // Beat 3: the warm completes and the byte-source switches to local.
  void opened.cacheWarming.then(() => {
    sourceEl.textContent = "local (cache)";
    log("✓ background warm complete — byte-source switched to local copy");
  });
}

$("load").addEventListener("click", () => void load());
