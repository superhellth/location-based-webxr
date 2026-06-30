/**
 * Thin wrapper around a ready `HTMLAudioElement` (view layer).
 *
 * The component is fed an already-constructed audio element (the factory takes
 * ready resources, mirroring how component 8 will hand a Blob URL from the
 * asset-provider). This wrapper exposes the few imperative calls the
 * reconciler needs — play / pause / seek — and forwards the element's
 * `timeupdate` / `ended` events back out as plain callbacks so the pure
 * transport reducer stays the single source of truth.
 *
 * Not unit-tested (it is glue over a DOM media element); the logic it drives
 * lives in playback-transport.ts.
 */

export interface AudioPlayer {
  play(): void;
  pause(): void;
  /** Seek to an absolute time in seconds (clamped to the known duration). */
  seekToSeconds(seconds: number): void;
  readonly currentTime: number;
  readonly paused: boolean;
  dispose(): void;
}

function knownDuration(element: HTMLAudioElement): number {
  return Number.isFinite(element.duration) ? element.duration : 0;
}

export function createAudioPlayer(
  element: HTMLAudioElement,
  callbacks: {
    readonly onTick: (positionSec: number, durationSec: number) => void;
    readonly onEnded: () => void;
  },
): AudioPlayer {
  const handleTime = (): void => {
    callbacks.onTick(element.currentTime, knownDuration(element));
  };
  const handleEnded = (): void => {
    callbacks.onEnded();
  };

  element.addEventListener("timeupdate", handleTime);
  element.addEventListener("loadedmetadata", handleTime);
  element.addEventListener("ended", handleEnded);

  return {
    play(): void {
      // Triggered from a click, so the autoplay policy is satisfied; a stray
      // rejection (e.g. element torn down mid-play) is benign here.
      void element.play().catch(() => undefined);
    },
    pause(): void {
      element.pause();
    },
    seekToSeconds(seconds: number): void {
      const duration = knownDuration(element);
      const upper = duration > 0 ? duration : seconds;
      element.currentTime = Math.max(0, Math.min(seconds, upper));
    },
    get currentTime(): number {
      return element.currentTime;
    },
    get paused(): boolean {
      return element.paused;
    },
    dispose(): void {
      element.removeEventListener("timeupdate", handleTime);
      element.removeEventListener("loadedmetadata", handleTime);
      element.removeEventListener("ended", handleEnded);
      element.pause();
      element.removeAttribute("src");
      element.load();
    },
  };
}
