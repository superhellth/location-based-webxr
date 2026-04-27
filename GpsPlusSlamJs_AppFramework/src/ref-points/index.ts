/**
 * Ref-points module — H3-based proximity matching for reference points.
 */

export {
  H3_RESOLUTION,
  type KnownRefPoint,
  approxDistanceMetres,
  gpsToH3,
  findNearbyRefPoint,
  h3RefsMatch,
  isH3Index,
} from './h3-ref-point.js';
