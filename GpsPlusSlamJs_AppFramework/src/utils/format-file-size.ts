/**
 * Format File Size Utility
 *
 * Converts byte counts to human-readable file size strings (B, KB, MB, GB).
 * Used by session summary to display ZIP file statistics.
 *
 * @see 2026-02-06 User Feedback Issue #3: ZIP stats on summary screen
 */

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const THRESHOLD = 1024;

/**
 * Format a byte count into a human-readable string.
 *
 * @param bytes - Number of bytes (non-negative integer expected)
 * @returns Formatted string like "512 B", "1.5 KB", "23.4 MB", "1.0 GB"
 *
 * @example
 * formatFileSize(0)          // "0 B"
 * formatFileSize(512)        // "512 B"
 * formatFileSize(1048576)    // "1.0 MB"
 * formatFileSize(2500000000) // "2.3 GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return '0 B';
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= THRESHOLD && unitIndex < UNITS.length - 1) {
    value /= THRESHOLD;
    unitIndex++;
  }

  // Bytes are shown as integers, others with 1 decimal
  if (unitIndex === 0) {
    return `${Math.round(value)} B`;
  }
  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}
