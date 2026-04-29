# cla-config.test.js

## Purpose

Static consistency check that locks the four CLA artifacts in the public repo to a single source of truth:

1. `CLA.md` (the legal document)
2. `.github/workflows/cla.yml` (the bot)
3. `CONTRIBUTING.md` (what we tell contributors to type)
4. `.github/PULL_REQUEST_TEMPLATE.md` (the acknowledgement checkbox)

The dominant failure mode this catches is **drift between the workflow's `custom-pr-sign-comment` and CONTRIBUTING.md**: if a future edit changes the wording in one place but not the other, contributors would post a sentence the bot does not recognize, and signatures would silently never be recorded. We cannot detect that against a live PR until the first external contribution arrives, so this test is the only pre-contribution safety net.

## Public API

None — this is a vitest spec, executed via `pnpm run test:repo-config` (root) or as part of the CI `repo-config` job.

## Invariants asserted

| # | Assertion |
| --- | --- |
| 1 | `CLA.md` exists at repo root and is non-empty. |
| 2 | The workflow pins `contributor-assistant/github-action` to an exact version (`@vMAJOR.MINOR.PATCH`, never a moving tag like `@v2`). |
| 3 | `with.custom-pr-sign-comment` from the workflow appears verbatim in `CONTRIBUTING.md`. |
| 4 | `with.path-to-document` parses as a URL whose path ends in `/CLA.md`. |
| 5 | `with.path-to-signatures` is `signatures/version1/cla.json` and `with.branch` is `cla-signatures`. |
| 6 | `.github/PULL_REQUEST_TEMPLATE.md` mentions `CLA.md`. |

## Out of scope (cannot be tested statically)

- Whether the bot actually comments on PRs.
- Whether `pull_request_target` permissions resolve correctly.
- Whether the default `GITHUB_TOKEN` can push to the `cla-signatures` branch.
- Whether replying with the sign-off line records a signature.
- Whether the all-signed comment fires after the last unsigned commit is signed.

These behaviors are deferred to the first real external contribution. See §10.2 step 7 of the [Separate Public Repository Plan](../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-03-30-separate-public-repo-plan.md) (private repo) for the rationale.

## Examples

```bash
# From the public repo root:
pnpm run test:repo-config
```

## Tests

This file _is_ a test. The artifacts it reads are themselves the production assets — there is no separate fixture data.
