/**
 * File System Utilities - Pure Functions
 *
 * These are extracted from file-system.ts so they can be tested
 * without mocking browser APIs.
 */

/**
 * Format a Date as a timestamp string for folder names
 * @example "2025-02-28_14-30-11utc"
 */
export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_` +
    `${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}utc`
  );
}

/**
 * Format an action file index as a zero-padded filename
 * @example 42 -> "000042.json"
 */
export function formatActionFilename(index: number): string {
  return `${String(index).padStart(6, '0')}.json`;
}

/**
 * Format a frame index as a zero-padded filename
 * @example 42 -> "frame-000042.jpg"
 */
export function formatFrameFilename(index: number): string {
  return `frame-${String(index).padStart(6, '0')}.jpg`;
}
