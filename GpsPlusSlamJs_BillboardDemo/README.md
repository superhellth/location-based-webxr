# gps-plus-slam-billboard-demo

Component 1 (warm-up) of the AR audio tour-guide lab: a **clickable cylindrical
billboard sprite with audio + an in-world transport panel**. A 2D image at a
world position that yaws to face the user but stays upright (rotates around Y
only — never tilts or rolls), plays an audio clip when clicked, and shows a
billboarded panel (play/stop + a seekable progress bar) below it.

It is the seed of the AR knight markers and tap-to-play story (component 8),
which reuses this picking + billboard + transport logic with a GLTF model and an
asset-provider URL in place of the plane and `HTMLAudioElement`.

## Structure

Pure, framework-free, unit-tested core — separated from the Three.js/DOM view:

| File                           | Kind | Role                                                 |
| ------------------------------ | ---- | ---------------------------------------------------- |
| `src/billboard-math.ts`        | pure | cylindrical-billboard Y-yaw                          |
| `src/playback-transport.ts`    | pure | single-source-of-truth transport reducer + selectors |
| `src/panel-layout.ts`          | pure | panel UV → toggle/seek hit-mapping                   |
| `src/clickable-billboard.ts`   | view | sprite + panel + audio composition unit              |
| `src/transport-panel-view.ts`  | view | `CanvasTexture` panel (XR-safe)                      |
| `src/audio-player.ts`          | view | `HTMLAudioElement` wrapper                           |
| `src/billboard-interaction.ts` | view | pointer raycast → sprite/panel hit                   |
| `src/main.ts`                  | demo | scene + OrbitControls + dispatch/render loop         |

Each behaviour file has a colocated `*.ts.md` sidecar.

## Commands

```bash
pnpm dev           # demo at http://localhost:5182
pnpm test          # format + lint + typecheck + checks + unit (the gate)
pnpm run test:unit # fast vitest loop
```

## Fixtures

`public/marker-*.png` + `public/clip-*.wav` are throwaway placeholders generated
by `node scripts/make-fixtures.mjs` (a real tour ships GLB/MP3/OGG).

## Scope notes

- **Tap-to-seek** (not drag-scrub): one gesture, identical on desktop and
  immersive XR. Continuous drag is a possible later desktop enhancement.
- No replay e2e: Component 1 has no movement dependency (the first
  replay-tested component is the proximity state machine, #4). Proof here is
  unit tests + the demo.
