# audio-player.ts

## Purpose

Thin view-layer wrapper around a ready `HTMLAudioElement`. Exposes the few
imperative calls the reconciler needs (`play`/`pause`/`seekToSeconds`) and
forwards the element's `timeupdate`/`ended` events out as plain callbacks, so
[playback-transport](playback-transport.ts) stays the single source of truth.

## Public API

- `interface AudioPlayer { play(); pause(); seekToSeconds(seconds); currentTime; paused; dispose() }`.
- `createAudioPlayer(element, { onTick(positionSec, durationSec), onEnded() }): AudioPlayer`.

## Invariants & assumptions

- The element is **injected ready** (the factory takes resources, not URLs) —
  this is the seam component 8 reuses with an asset-provider URL.
- `play()` is expected to be called from a user gesture (a click); a rejected
  `play()` promise is swallowed as benign.
- `seekToSeconds` clamps to `[0, duration]` once the duration is known.
- `dispose()` removes listeners, pauses, and clears `src` (releases the media).

## Examples

```ts
const player = createAudioPlayer(audioEl, {
  onTick: (pos, dur) =>
    dispatch({ type: "tick", positionSec: pos, durationSec: dur }),
  onEnded: () => dispatch({ type: "ended", id }),
});
player.play();
```

## Tests

Not unit-tested — it is glue over a DOM media element. The behaviour it drives
is pinned in [playback-transport.test.ts](playback-transport.test.ts); the wiring
is exercised manually via the demo.
