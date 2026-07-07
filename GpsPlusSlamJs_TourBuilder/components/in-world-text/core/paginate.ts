/**
 * Pure pagination: chunk wrapped lines into fixed-height pages.
 *
 * Runs after `wrapText` and drives the Prev/Next navigation. Framework-free and
 * unit-tested. Always returns at least one page (an empty input yields a single
 * empty page) so the panel — buttons, indicator, chrome — always has something
 * to render.
 */

/** Split `lines` into pages of at most `linesPerPage` lines each. */
export function paginate(
  lines: readonly string[],
  linesPerPage: number,
): string[][] {
  if (linesPerPage < 1) {
    throw new Error(`linesPerPage must be >= 1, got ${linesPerPage}`);
  }
  if (lines.length === 0) {
    return [[]];
  }
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages;
}
