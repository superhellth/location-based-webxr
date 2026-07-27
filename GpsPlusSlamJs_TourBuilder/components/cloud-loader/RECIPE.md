# Publishing a tour so the viewer can range-read it

Component 6 fetches whatever URL is in `?tour=` and follows redirects — it has
**zero provider-specific code** (C7). The only thing that varies between hosts is
which URL supports **HTTP Range + CORS**, and that is a hosting/authoring concern,
documented here. The single hard requirement is CORS: the download URL must return
`Access-Control-Allow-Origin` for the app's origin, or the browser blocks the
cross-origin read regardless of whether the server supports ranges.

The loader sources the archive **size from a HEAD `Content-Length`** (a
CORS-safelisted header every host exposes), and **falls back to the 206's
`Content-Range`** when HEAD gives none (the proxy path) — so a host only needs to
answer a `Range` GET with `206`, plus either HEAD `Content-Length` or an exposed
`Content-Range`.

## GitHub raw (recommended — no CORS setup)

`raw.githubusercontent.com/<user>/<repo>/<branch>/path/tour.zip`

- Empirically probed: `206` + `accept-ranges: bytes` + `access-control-allow-origin: *`;
  size via HEAD `content-length`. Works with this loader **as-is**, from localhost
  and production alike — no proxy, no config.
- Caveats: **100 MB per-file hard limit** (a media-heavy tour can exceed it), Git
  is not a binary CDN, and it is not an "everyday cloud storage" service in the
  §2.5.6 sense — great for testing/small tours, not the intended authoring story.

## Dropbox (needs a proxy — see below)

Dropbox is an "everyday cloud storage" target (§2.5.6) and supports Range, **but
its direct-download hosts generally do not send `Access-Control-Allow-Origin`**,
so a browser blocks the cross-origin read even though `curl` succeeds. To use
Dropbox you must front it with a CORS proxy — see
"Making Dropbox … work via a proxy" below.

1. Upload `tour.zip`; "Copy link" → `https://www.dropbox.com/scl/fi/…/tour.zip?rlkey=…&dl=0`.
2. Set `dl=1` (or swap the host to `dl.dropboxusercontent.com`) for a raw response.
3. Confirm CORS is the only blocker (headers present under `curl`, blocked in
   the browser): `curl -s -D - -o /dev/null -H "Origin: https://example.com" -H "Range: bytes=0-0" "<url>"` —
   if there is **no** `access-control-allow-origin` line, you need the proxy.
4. Route it through the proxy and use the proxy URL as the `?tour=` value.

## Others (not wired for the demo)

- **Google Drive** — needs `files.get?alt=media` with an API key/auth, and larger
  files hit a virus-scan interstitial that serves HTML instead of bytes. Avoid for
  a live demo.
- **OneDrive / Box** — the content endpoint 302-redirects to a temporary download
  URL; `fetch` follows it automatically, but the temp URL expires. Usable, more
  moving parts.

## Making Dropbox (or any no-CORS host) work via a proxy

Dropbox's direct-download hosts support Range but generally **do not send
`Access-Control-Allow-Origin`**, so a browser blocks the read (see the CORS note
above). `curl` passing is not proof — only a browser enforces CORS. To keep
Dropbox as the author's storage, put a thin CORS-adding proxy in front of it. The
loader is provider-agnostic and follows redirects, so a proxy URL drops in as the
`?tour=` value with **no app code change** — the proxy's only jobs are to add the
CORS headers Dropbox omits, **expose `Content-Range`** (the loader sizes the
archive from it when HEAD gives no `Content-Length`), and forward the `Range`
header so 206 reads pass through.

### Dev — built in (Vite)

`vite.config.ts` ships a dev-only proxy at **`/tour-proxy?u=<encoded url>`**
(host-allowlisted to Dropbox / GitHub raw / jsDelivr). Because the browser talks
to same-origin `localhost`, there is no CORS at all. Paste this into the demo's
URL box (dev only):

```
/tour-proxy?u=https%3A%2F%2Fdl.dropboxusercontent.com%2Fscl%2Ffi%2F…%2Ftour.zip%3Frlkey%3D…
```

Verified: a `Range` request through it returns `206 Partial Content` +
`Content-Range`, streamed straight from the upstream host.

### Prod — Cloudflare Worker (Hono)

Same `?u=` interface, so the demo URL shape is identical to dev. `hono/cors`
handles the CORS/preflight/expose-headers; the handler allowlists hosts (so it is
not an open relay) and forwards Range + follows redirects.

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";

const ALLOWED_HOSTS = new Set(["dl.dropboxusercontent.com", "www.dropbox.com"]);

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["https://your-viewer.example"], // your app origin(s)
    allowMethods: ["GET", "HEAD"],
    // Content-Range is what the loader reads to size the archive (item 1).
    exposeHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  }),
);

app.on(["GET", "HEAD"], "/", async (c) => {
  const target = c.req.query("u");
  if (!target) return c.text("missing ?u=", 400);

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return c.text("bad url", 400);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) return c.text("host not allowed", 403);

  const range = c.req.header("Range");
  const upstream = await fetch(url, {
    method: c.req.method,
    headers: range ? { Range: range } : {},
    redirect: "follow", // Dropbox 302s www → dl.dropboxusercontent.com
  });

  const headers = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});

export default app;
```

Deploy with `wrangler deploy` (a `hono` dependency + a `wrangler.toml`). The
`?tour=` value then becomes
`https://your-worker.workers.dev/?u=<encoded dropbox dl=1 url>`.

**Operational notes:** every range read _and_ the background full-download flow
through the Worker, so for large tours mind your Worker's request/egress limits
(fine for small tours). Restrict `origin` to your real app origins rather than
`*` to double as abuse control. If Dropbox serves an HTML interstitial (rate limit
/ very large file), the bytes reach zip.js and surface as `TourLoadError("corrupt")`.

## The fallback (any host)

If a link serves the whole file on a `Range` request (answers `200`, not `206`),
the tour **still works** — the loader ingests that full body and reads it locally
(C5). You only lose the instant-first-asset benefit. A CORS-_blocked_ link is the
one unrecoverable case (it defeats both the range path and the full-body
fallback), surfaced as `TourLoadError("cors")`.
