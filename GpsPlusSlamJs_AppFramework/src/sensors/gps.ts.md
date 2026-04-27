# gps.ts

## Purpose

Handles Geolocation API access (GPS position) and DeviceOrientation API (compass/accelerometer).

## Public API

| Export                                 | Type                  | Description                                                   |
| -------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `GpsPosition`                          | interface             | Position reading with lat/lon/accuracy                        |
| `RawDeviceOrientation`                 | interface             | Raw alpha/beta/gamma orientation (nullable, from browser API) |
| `startGpsWatch(onPosition, onError?)`  | function              | Start GPS watch                                               |
| `stopGpsWatch()`                       | function              | Stop GPS watch                                                |
| `startOrientationWatch(onOrientation)` | function              | Start compass/orientation                                     |
| `stopOrientationWatch()`               | function              | Stop orientation                                              |
| `requestOrientationPermission()`       | `async () => boolean` | iOS 13+ permission                                            |

## Interfaces

```typescript
interface GpsPosition {
  lat: number;
  lon: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null; // GPS-based heading
  speed: number | null;
  timestamp: number;
}

interface RawDeviceOrientation {
  alpha: number | null; // Compass (0-360)
  beta: number | null; // Front-back tilt
  gamma: number | null; // Left-right tilt
  absolute: boolean;
}
```

## Invariants & Assumptions

- Geolocation API available (`navigator.geolocation`)
- Uses `enableHighAccuracy: true` for best GPS fix
- DeviceOrientation requires user gesture on iOS 13+
- `alpha` (compass) may be null if device lacks magnetometer
- **`startGpsWatch` is idempotent:** calling it again clears any existing watch first (prevents leaked watches when transitioning from warm-up to recording)
- **`startOrientationWatch` is idempotent:** calling it again removes the previous `deviceorientation` listener first, mirroring the `startGpsWatch` pattern

## Examples

```typescript
import { startGpsWatch, stopGpsWatch, GpsPosition } from './sensors/gps';

startGpsWatch((pos: GpsPosition) => {
  console.log(`GPS: ${pos.lat}, ${pos.lon} ±${pos.accuracy}m`);
});

// Later
stopGpsWatch();
```

## Tests

- `gps.test.ts` — unit tests covering GPS watch start/stop, orientation watch start/stop, idempotency of both `startGpsWatch` and `startOrientationWatch` (calling twice removes previous listener), and `requestOrientationPermission`.
- Manual testing required on device with GPS
- Integration validated via E2E smoke tests
