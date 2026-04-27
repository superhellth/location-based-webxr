/**
 * Shared list formatter for displaying comma-separated lists with "and".
 *
 * Uses English locale to match the app's UI language. If i18n support is added
 * in the future, this should be updated to use the user's preferred locale.
 *
 * @example
 * listFormatter.format(['Camera', 'Location']) // "Camera and Location"
 * listFormatter.format(['A', 'B', 'C']) // "A, B, and C"
 */
export const listFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});
