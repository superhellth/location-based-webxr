/**
 * Parse the total archive size out of a `Content-Range` response header.
 *
 * The size fallback for the opening probe (C5): a `206` always carries a
 * `Content-Range` header of the form `bytes START-END/TOTAL` (or the
 * unsatisfied-range form with an asterisk in place of the range), so when a
 * host — or a CORS proxy we control — exposes that header, we can size the
 * archive from it even if HEAD gives no `Content-Length`. TOTAL may itself be an
 * asterisk (unknown), in which case there is nothing usable.
 *
 * @see plans/2026-07-24-cloud-loader-plan.md (C5)
 */

/** Total from `bytes <range>/<total>`, or null if unknown/absent/malformed. */
export function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = /^bytes\s+(?:\d+-\d+|\*)\/(\d+)$/.exec(header.trim());
  return m ? Number(m[1]) : null;
}
