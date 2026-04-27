# recording-coordinator.property.test.ts

## Purpose

Property-based tests for the `recording-coordinator.ts` module, specifically testing the `eulerToQuaternion` function with randomly generated inputs to verify mathematical invariants hold for all valid Euler angles.

## Why Property-Based Testing?

Unit tests verify specific examples, but property-based tests verify invariants that MUST hold for ALL valid inputs. Quaternion math is particularly prone to edge case bugs (gimbal lock, floating-point accumulation, angle wrapping) that property testing can catch.

## Properties Tested

### Basic Quaternion Invariants

| Property           | Description               | Why It Matters                                     |
| ------------------ | ------------------------- | -------------------------------------------------- |
| Unit quaternion    | `\|q\| ≈ 1` for any input | Non-unit quaternions cause scaling during rotation |
| Alpha periodicity  | `q(α) ≈ q(α ± 360°)`      | Compass heading wraps at 360°                      |
| Beta periodicity   | `q(β) ≈ q(β ± 360°)`      | Pitch angle periodicity                            |
| Gamma periodicity  | `q(γ) ≈ q(γ ± 360°)`      | Roll angle periodicity                             |
| Valid output       | Returns 4 finite numbers  | No NaN/Infinity corruption                         |
| Bounded components | All `q[i] ∈ [-1, 1]`      | Required for unit quaternion                       |
| Determinism        | Same input → same output  | No hidden state affecting results                  |

### ZXY Rotation Order Verification

| Property              | Description                           | Why It Matters                            |
| --------------------- | ------------------------------------- | ----------------------------------------- |
| ZXY order composition | Combined rotation = qY \* qX \* qZ    | Validates correct DeviceOrientation order |
| Alpha-only Z rotation | Only alpha set → pure Z-axis rotation | Compass heading works correctly           |
| Beta-only X rotation  | Only beta set → pure X-axis rotation  | Pitch tilt works correctly                |
| Gamma-only Y rotation | Only gamma set → pure Y-axis rotation | Roll tilt works correctly                 |

### Rotation Properties

| Property                   | Description                                      | Why It Matters                           |
| -------------------------- | ------------------------------------------------ | ---------------------------------------- |
| Inverse single-axis        | `q(θ) * q(-θ) ≈ identity`                        | Negated angles produce inverse rotations |
| Quaternion inverse         | `v' = q(v)` then `v = q⁻¹(v')` restores original | Transformations are reversible           |
| Vector length preservation | `\|q(v)\| = \|v\|` for any vector                | Rotation doesn't scale vectors           |

### Edge Cases & Stability

| Property              | Description                           | Why It Matters                         |
| --------------------- | ------------------------------------- | -------------------------------------- |
| Gimbal lock stability | Valid output near β = ±90°            | No NaN/Infinity at singularities       |
| Extreme angles        | Valid output for angles up to ±10000° | Multiple full rotations don't overflow |

## Test Configuration

- **Runs per property**: 200-1000 (configurable via `{ numRuns: N }`)
- **Input ranges** (per DeviceOrientation spec):
  - `alpha`: 0° to 360° (compass heading)
  - `beta`: -180° to 180° (front-to-back tilt)
  - `gamma`: -90° to 90° (left-to-right tilt)

## Tolerance Notes

The unit quaternion test uses `toBeCloseTo(1, 6)` (6 decimal places) because:

- gl-matrix floating-point operations accumulate small errors
- Device orientation sensors have ~0.01° noise anyway
- 6 decimal places (1e-6 error) is more than sufficient for practical use

Vector length preservation uses relative tolerance (`originalLength * 1e-6`) to handle vectors of varying magnitudes.

## Dependencies

- `fast-check` (^4.3.0) - Property-based testing framework
- `gl-matrix` - Vector/quaternion math for rotation verification
- `vitest` - Test runner

## Related Files

- [recording-coordinator.ts](recording-coordinator.ts) - Implementation
- [recording-coordinator.test.ts](recording-coordinator.test.ts) - Unit tests
- [recording-coordinator.ts.md](recording-coordinator.ts.md) - Module documentation
