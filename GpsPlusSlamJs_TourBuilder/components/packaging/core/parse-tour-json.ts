/**
 * `parseTourJson` — turn raw tour.json text (typed, pasted, or uploaded) into a
 * validated `Tour` (Component 5, the demo's "use your own tour" input path).
 *
 * The only error the caller has to handle: a JSON syntax error is rethrown as a
 * `TourValidationError` so it reads the same as an invariant violation from
 * `validateTour` — one error type, one status line.
 *
 * @see plans/2026-07-24-packaging-own-tour-plan.md (decision 4)
 */

import type { Tour } from "../../../store/types.js";
import {
  TourValidationError,
  validateTour,
} from "../../../store/validate-tour.js";

/**
 * @throws {TourValidationError} on invalid JSON syntax or a `validateTour`
 * invariant violation. Never returns a partial `Tour`.
 */
export function parseTourJson(text: string): Tour {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TourValidationError(`invalid JSON: ${message}`);
  }
  return validateTour(raw);
}
