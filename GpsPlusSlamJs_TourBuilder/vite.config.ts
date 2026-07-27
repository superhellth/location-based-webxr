import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { Readable } from "node:stream";

// Dev-only CORS proxy for Component 6, mirroring the production Cloudflare
// Worker's `?u=` interface so a demo `?tour=` URL is identical in both. The
// browser talks to same-origin localhost (no CORS), and this middleware fetches
// the target server-side (Node fetch ignores CORS), following redirects and
// forwarding the Range header so byte-range 206 reads pass straight through.
// Host-allowlisted to the everyday cloud providers so it is not an open relay.
// See components/cloud-loader/RECIPE.md.
const ALLOWED_PROXY_HOSTS = new Set([
  "dl.dropboxusercontent.com",
  "www.dropbox.com",
  "raw.githubusercontent.com",
  "cdn.jsdelivr.net",
]);

function tourProxyPlugin(): Plugin {
  return {
    name: "cloud-loader-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/tour-proxy", (req, res, next) => {
        const target = new URL(
          req.url ?? "",
          "http://localhost",
        ).searchParams.get("u");
        if (!target) {
          next();
          return;
        }
        let url: URL;
        try {
          url = new URL(target);
        } catch {
          res.statusCode = 400;
          res.end("bad ?u= url");
          return;
        }
        if (!ALLOWED_PROXY_HOSTS.has(url.hostname)) {
          res.statusCode = 403;
          res.end(`host not allowed: ${url.hostname}`);
          return;
        }

        const range = req.headers.range;
        void fetch(url, {
          method: req.method,
          headers: range ? { Range: range } : {},
          redirect: "follow",
        })
          .then((upstream) => {
            res.statusCode = upstream.status;
            // Never let the browser cache proxied responses: the same URL yields
            // 206 range reads and a 200 full warm download, and without this the
            // browser's range cache cross-contaminates them (a cached partial
            // served for a later range) → zip.js reads garbage → "not a readable
            // zip". Node's fetch has no such cache, so this only bites in-browser.
            res.setHeader("Cache-Control", "no-store");
            for (const h of [
              "content-type",
              "content-length",
              "content-range",
              "accept-ranges",
            ]) {
              const v = upstream.headers.get(h);
              if (v) res.setHeader(h, v);
            }
            if (!upstream.body) {
              res.end();
              return;
            }
            Readable.fromWeb(upstream.body).pipe(res);
          })
          .catch((err: unknown) => {
            res.statusCode = 502;
            res.end(`proxy fetch failed: ${String(err)}`);
          });
      });
    },
  };
}

// TourBuilder is a multi-page app: one runnable demo page per component under
// components/<name>/index.html, plus a root gallery that links to them. Vite's
// dev server auto-serves every nested index.html by path (e.g.
// /components/billboard/ runs the billboard demo alone); the build emits each
// as its own HTML entry. Add one line to `input` per new component.
//
// AppFramework resolves through the pnpm workspace symlink; three comes from
// node_modules. A distinct port keeps it runnable alongside the minimal example
// (5180), starter (5181) and recorder.
export default defineConfig({
  plugins: [tourProxyPlugin()],
  server: {
    port: 5182,
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        gallery: resolve(__dirname, "index.html"),
        billboard: resolve(__dirname, "components/billboard/index.html"),
        inWorldText: resolve(
          __dirname,
          "components/in-world-text/index.html",
        ),
        store: resolve(__dirname, "components/store/index.html"),
        proximity: resolve(__dirname, "components/proximity/index.html"),
        packaging: resolve(__dirname, "components/packaging/index.html"),
        cloudLoader: resolve(
          __dirname,
          "components/cloud-loader/index.html",
        ),
      },
    },
  },
});
