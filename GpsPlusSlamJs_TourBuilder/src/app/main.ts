/**
 * TourBuilder app entry (Goal-2 composition). Mode is decided once, at
 * bootstrap, by `?tour=` presence (contract D13) — see `mode.ts`.
 */
import { resolveAppMode } from "./mode.js";
import { mountAuthoringApp } from "./authoring/authoring-app.js";
import { mountViewingPlaceholder } from "./viewing-placeholder.js";

const root = document.getElementById("app-root");
if (root === null) {
  throw new Error("app root element not found");
}

const mode = resolveAppMode(new URL(location.href));

if (mode === "authoring") {
  mountAuthoringApp(root);
} else {
  mountViewingPlaceholder(root);
}
