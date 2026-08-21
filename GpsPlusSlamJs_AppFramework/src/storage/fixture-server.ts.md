# fixture-server.ts

## Purpose

A local HTTP fixture server (test-only) that serves a real zip archive under
several path-selected network behaviours, so every branch
`open-remote-tour.ts` handles — honouring Range, refusing it, 404, 416, a
truncated file, or a CORS/connection failure — is exercised deterministically
with no real cloud provider involved. Node's `fetch` (undici) performs real
206/Content-Range/redirect handling, so tests catch the header mistakes that
actually bite in production; the one thing Node cannot reproduce is _browser_
CORS enforcement, so `/no-cors` approximates it by dropping the connection.

Not part of the package's public surface — consumed only by
`open-remote-tour.integration.test.ts`, so it has no `tsdown` entry and is
not advertised in `package.json` `exports`.

## Public API

- **`FixtureServer`** — `{ origin, zip, requestCount(pathPrefix?), close() }`.
- **`startFixtureServer<T extends MinimalParsedArchive>(tour: T, assetFiles: Map<string, File>, extraZips?: Map<string, Uint8Array>): Promise<FixtureServer>`**
  — builds one zip (`tour.json` + `assetFiles`, matched to `tour.assets` by
  id) via `packFilesAsZip`, then starts a server that serves it (or an
  `extraZips` entry) under a mode selected by the first URL path segment:
  `no-cors` (drops the connection), `missing` (404), `empty` (416 on GET),
  `corrupt` (garbage bytes), `no-ranges` (ignores Range, answers 200),
  `no-head-len` (HEAD omits Content-Length), `no-size` (neither
  Content-Length nor Content-Range anywhere), any `extraZips` key, or the
  default range-capable path.

## Invariants & assumptions

- `assetFiles` is keyed by asset id; every id must have a matching entry in
  `tour.assets` or `startFixtureServer` throws before the server starts.
- Binds to `127.0.0.1` on an OS-assigned port (`origin` reports the actual
  port after `listen`).
- `requestCount(prefix)` counts every request whose URL starts with `prefix`
  (or all requests, with no argument) — for asserting cache-hit behaviour
  (no new requests after a local-cache switch).

## Examples

```ts
import { startFixtureServer } from './fixture-server.js';

const server = await startFixtureServer(tour, assetFiles);
const { tour: loaded } = await openRemoteTour(
  `${server.origin}/ranges-ok/tour.zip`,
  parseTour
);
await server.close();
```

## Tests

- Exercised transitively via `open-remote-tour.integration.test.ts`; no
  dedicated test file of its own (it is itself test infrastructure).
