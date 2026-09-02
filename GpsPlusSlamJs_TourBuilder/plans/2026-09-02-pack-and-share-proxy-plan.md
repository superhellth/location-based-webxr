# 2026-09-02 — Pack & share: no-CORS host proxy routing (design)

## Context

`mountPackAndSharePanel` (`src/app/authoring/pack-and-share-panel.ts`,
plan `2026-08-14-authoring-composition-plan.md` AC5) is the composed
authoring app's link-generation step: pack the tour, paste the hosted ZIP
URL, generate a `?tour=<zipUrl>` link + QR (`buildTourUrl` +
`generateQr`).

Component 6 (cloud-loader) already knows that some hosts serve bytes but
refuse a cross-site *browser* fetch (Dropbox: no CORS headers at all;
`drive.usercontent.google.com`: 403s on `Sec-Fetch-Site: cross-site`) and
must be routed through the dev proxy (`vite.config.ts`'s `/tour-proxy?u=`)
or, in production, a Worker proxy (see `components/cloud-loader/RECIPE.md`).
That logic — `PROXY_REQUIRED_HOSTS` + `prepareTourUrl` — exists today only
inside `components/cloud-loader/demo.ts` (lines 26–72), used to prep a URL
*before reading* a tour. `pack-and-share-panel.ts` has no equivalent: an
author pasting a raw Dropbox/Drive link produces a QR/link that fails when
scanned, because the composed app never routes it through the proxy.
Confirmed by grep: `src/app/` has zero references to `tour-proxy`,
`normalizeShareUrl`, or `PROXY_REQUIRED_HOSTS` today.

## What this plan does NOT do

- Any change to the viewing side's handling of `?tour=` — it already
  receives whatever URL generation produced; this plan makes sure that URL
  is proxy-safe *at generation time*, not at read time.
- The production Worker proxy itself (`RECIPE.md` already documents that
  setup). In prod builds the panel keeps `import.meta.env.DEV`'s existing
  behavior: show a warning, leave the URL unrewritten.
- Any UI beyond the two panel fields already there (`App base URL`,
  `Hosted ZIP URL`) — no new host allowlist configuration surfaced to the
  author.

---

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extract `PROXY_REQUIRED_HOSTS` + the `prepareTourUrl` logic out of `cloud-loader/demo.ts` into a new pure module `src/components/shared/hosted-zip-url.ts`, renamed `prepareHostedZipUrl`. | `shared/` already exists for cross-component pure helpers (`billboard-math.ts`, `canvas-panel.ts`, `panel-geometry.ts`, per CLAUDE.md). This logic is needed by both the packaging/link-gen side (new) and cloud-loader (existing) — extracting avoids two copies of the no-CORS host list, which `jscpd` would otherwise flag as duplication. |
| D2 | `prepareHostedZipUrl(raw: string, isDev: boolean): PreparedZipUrl` takes dev-ness as a parameter instead of reading `import.meta.env.DEV` internally. | Keeps the extracted function pure and framework-free (consistent with every other `core`/`shared` module never touching Vite env directly), and makes both branches trivially unit-testable without env mocking. Callers pass `import.meta.env.DEV` at the call site. |
| D3 | `pack-and-share-panel.ts`'s Generate QR handler runs the existing `new URL(zipUrlInput.value)` validity check first (AC13, unchanged), then calls `prepareHostedZipUrl(value, import.meta.env.DEV)` and feeds `.url` to `buildTourUrl`. | Preserves the existing "reject garbage input before building a broken QR" guard; proxy prep only runs on an already-valid absolute URL. |
| D4 | `.notes` render in a new `<p data-testid="url-notes">` under the ZIP-URL field, replaced on every Generate QR click. | Mirrors `cloud-loader/demo.ts`'s transparency (`log()` of normalization/proxy notes) — the author should see when/why their link was rewritten, not have it silently altered. |
| D5 | `cloud-loader/demo.ts` is refactored to import `prepareHostedZipUrl` from `shared/` instead of its local copy, passing `import.meta.env.DEV` at its own call site. No behavior change there. | Removes the duplication at the source instead of leaving stale code behind. |

---

## Architecture

### `src/components/shared/hosted-zip-url.ts` — pure

```ts
import { normalizeShareUrl } from "gps-plus-slam-app-framework/storage";

export const PROXY_REQUIRED_HOSTS = new Set([
  "dl.dropboxusercontent.com",
  "drive.usercontent.google.com",
]);

export interface PreparedZipUrl {
  readonly url: string;
  readonly notes: readonly string[];
}

/**
 * Turn a pasted hosted-ZIP URL (or cloud-provider share page link) into a
 * fetchable value: share pages are normalized to their raw download URL,
 * and known no-CORS hosts are routed through the dev proxy
 * (`/tour-proxy?u=…`) when `isDev`. In production there is no local proxy,
 * so the URL is left as-is with a warning — see cloud-loader/RECIPE.md for
 * the Worker setup.
 */
export function prepareHostedZipUrl(raw: string, isDev: boolean): PreparedZipUrl {
  const notes: string[] = [];
  const normalized = normalizeShareUrl(raw);
  if (normalized !== raw) notes.push(`share link normalized → ${normalized}`);

  let host: string;
  try {
    host = new URL(normalized).hostname;
  } catch {
    return { url: normalized, notes }; // relative (e.g. already-proxied) URL
  }

  if (!PROXY_REQUIRED_HOSTS.has(host)) return { url: normalized, notes };
  if (!isDev) {
    notes.push(
      `⚠ ${host} serves no CORS headers — route it through the Worker proxy (RECIPE.md)`,
    );
    return { url: normalized, notes };
  }
  const proxied = `/tour-proxy?u=${encodeURIComponent(normalized)}`;
  notes.push(`no-CORS host ${host} → routed via dev proxy`);
  return { url: proxied, notes };
}
```

### `pack-and-share-panel.ts` — Generate QR handler (delta only)

```ts
import { prepareHostedZipUrl } from "../../components/shared/hosted-zip-url.js";

// ...existing new URL(zipUrlInput.value) validity check unchanged...

const prepared = prepareHostedZipUrl(zipUrlInput.value, import.meta.env.DEV);
urlNotes.textContent = prepared.notes.join(" · ");

try {
  const url = buildTourUrl(appBaseInput.value, prepared.url);
  renderQrSvg(qrHost, await generateQr(url));
  qrStatus.textContent = url;
  qrStatus.dataset["state"] = "ok";
} catch (error) {
  /* unchanged */
}
```

New DOM element (added alongside `zipUrlLabel`):

```ts
const urlNotes = document.createElement("p");
urlNotes.dataset.testid = "url-notes";
section.appendChild(urlNotes);
```

### `cloud-loader/demo.ts` — delta only

Remove the local `PROXY_REQUIRED_HOSTS` const and `prepareTourUrl`
function; import `prepareHostedZipUrl` from `../shared/hosted-zip-url.js`
and call it as `prepareHostedZipUrl(raw, import.meta.env.DEV)` at the one
existing call site.

---

## Testing

- `src/components/shared/hosted-zip-url.test.ts` (new): ordinary URL
  passthrough (no notes); share-link normalization delegated correctly;
  proxy-required host + `isDev=true` → rewritten to `/tour-proxy?u=…` with
  a note; proxy-required host + `isDev=false` → left unrewritten with a
  warning note; relative/unparseable input → passthrough, no throw.
- `src/app/authoring/pack-and-share-panel.test.ts` (new — none exists
  today): Generate QR with a plain hosted URL produces no notes and a QR
  built from that URL unchanged; Generate QR with a `dl.dropboxusercontent.com`
  URL (dev) shows the proxy note and the built QR/link uses the
  `/tour-proxy?u=…` value; invalid URL still shows the existing "Enter a
  valid hosted ZIP URL first" error and never calls `prepareHostedZipUrl`.
- `cloud-loader/demo.ts` stays untested directly (it always has been — a
  manual-demo entry point, not `core`/`view`); its behavior is now covered
  indirectly by the shared module's unit tests.

## Acceptance

- Pasting a `dl.dropboxusercontent.com` or `drive.usercontent.google.com`
  ZIP URL into the pack-and-share panel in dev produces a `?tour=` link
  whose value is the `/tour-proxy?u=…` form, and the panel shows a note
  saying so.
- Pasting any other host's URL is unaffected — no note, link unchanged.
- `pnpm test` (TourBuilder gate: format/lint/typecheck/unit +
  jscpd/dpdm/dependency-cruiser) passes with the no-CORS host list defined
  in exactly one place.
