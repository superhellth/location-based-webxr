/**
 * Screen Wake Lock for the composed Authoring flow (plan
 * `plans/2026-08-14-authoring-composition-plan.md`, AC11). The phone screen
 * sleeping mid-walk stalls the live GPS position source silently — a real
 * field-failure mode. Feature-detected and non-fatal: an unsupported browser
 * or a rejected request degrades to "no wake lock," never a crash.
 */

export interface WakeLockHandle {
  release(): void;
}

const noopHandle: WakeLockHandle = { release() {} };

export async function requestWakeLock(): Promise<WakeLockHandle> {
  if (!("wakeLock" in navigator)) return noopHandle;
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    return {
      release() {
        void sentinel.release();
      },
    };
  } catch {
    return noopHandle;
  }
}
