# ref-point-handlers.test.ts

## Purpose

Unit tests for `ref-point-handlers.ts` — validates the factory+closure pattern, state management, validation guards, picker integration, observation building/persistence, visualization, and concurrent-call prevention.

## Test Structure

22 tests organized in groups:

1. **Factory & state** — creation, initial state, `setImportedRefPoints`, `clearSessionRefPointUsage`, `reset`
2. **Validation guards** — early returns for no AR pose, no GPS data, picker already visible, concurrent call guard
3. **Ref-point picker** — shows picker with correct ref-point ids, handles picker cancellation
4. **Observation building** — constructs `RefPointObservation` from AR pose + GPS + odom data
5. **Full flow** — end-to-end: picker → dispatch → persist → visualize → usage tracking, repeated selections

## Key Testing Patterns

- `vi.hoisted()` for mock definitions to avoid TDZ issues
- Explicit `mockReturnValue` / `mockResolvedValue` reset in **every** `beforeEach` block — `vi.clearAllMocks()` alone is insufficient

## Tests

Self-referential — this file documents `ref-point-handlers.test.ts`.
