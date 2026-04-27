/**
 * Browser mock tests.
 *
 * Why these tests matter:
 * - Mock geolocation serializers should match native browser behavior closely.
 * - Returning plain data keeps snapshots and debug logging predictable.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { createMockGeoPosition } from './browser-mocks';

describe('browser mocks', () => {
  describe('createMockGeoPosition', () => {
    it('returns plain data from geolocation serializers', () => {
      // Why this test matters: native GeolocationPosition serializers return
      // serializable data objects, not the original live instances.
      const position = createMockGeoPosition(50, 8.27, 100, 5);

      const coordsJson = position.coords.toJSON();
      const positionJson = position.toJSON();

      expect(coordsJson).toEqual({
        latitude: 50,
        longitude: 8.27,
        altitude: 100,
        accuracy: 5,
        altitudeAccuracy: 5,
        heading: null,
        speed: null,
      });
      expect(coordsJson).not.toBe(position.coords);
      expect('toJSON' in (coordsJson as object)).toBe(false);

      expect(positionJson).toEqual({
        coords: coordsJson,
        timestamp: position.timestamp,
      });
      expect(positionJson).not.toBe(position);
      expect('toJSON' in (positionJson as object)).toBe(false);
      expect(JSON.parse(JSON.stringify(position))).toEqual(positionJson);
    });
  });
});
