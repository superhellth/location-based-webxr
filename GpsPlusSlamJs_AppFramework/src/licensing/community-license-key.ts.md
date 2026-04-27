# community-license-key.ts

## Purpose

Bundles the signed community license key inside `gps-plus-slam-app-framework`
so every example app automatically receives a valid license for the closed-source
`gps-plus-slam-js` core library — without each app having to copy or wire the
key manually.

## Public API

- `COMMUNITY_LICENSE_KEY: string` — Ed25519-signed community license token.
  Used as the default value of `RecorderStoreOptions.licenseKey` inside
  `createRecorderStore()`. Apps can override it (e.g. paid keys) by passing
  their own `licenseKey`. The library is never usable without a valid key —
  invalid, empty, or expired keys throw.

## Invariants & assumptions

- The key is public and safe to ship in the open-source package.
- Only the **public** verification key is embedded in the closed-source core
  library (`GpsPlusSlamJs/src/licensing/license-key.ts`); the private signing
  key never lives on disk.
- Renewal happens via the secret-backed release workflow described in
  `GpsPlusSlamJs/docs/2026-04-25-private-key-security-plan.md`. The renewal
  workflow rewrites the string literal in this file.
- Keep this file at this exact path so the renewal workflow can find and
  rewrite the constant.

## Examples

```ts
import { createRecorderStore } from 'gps-plus-slam-app-framework/state';

// Uses COMMUNITY_LICENSE_KEY by default — no wiring required.
const store = createRecorderStore();

// Override with a paid license:
const paidStore = createRecorderStore({ licenseKey: MY_PAID_LICENSE });
```

## Tests

Signature/expiry behavior is covered by the core library in
`GpsPlusSlamJs/src/licensing/license-key.test.ts`. The default-injection
behavior of `createRecorderStore` is covered by
`GpsPlusSlamJs_AppFramework/src/state/store.test.ts`.
