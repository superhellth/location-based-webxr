# Sentry Error Tracking Module

## Purpose

Provides centralized Sentry configuration and utilities for error tracking,
performance monitoring, and structured logging throughout the RecorderApp.

## Public API

### `initSentry(): void`

Initializes the Sentry SDK. Must be called as early as possible in `main.ts`,
before any other code runs.

### `captureException(error: unknown): void`

Captures an exception and sends it to Sentry. Use in try/catch blocks.

```ts
try {
  riskyOperation();
} catch (error) {
  captureException(error);
}
```

### `startSpan(options, callback): ReturnType<callback>`

Creates a performance span for measuring operations. Returns the callback's
return value.

```ts
startSpan({ op: 'ui.click', name: 'Start Recording' }, (span) => {
  span.setAttribute('scenarioId', scenarioId);
  performAction();
});
```

### `logger`

Sentry's structured logger for sending log events.

```ts
logger.info('Session started', { sessionId: '123' });
logger.error('Failed to save frame', { frameIndex: 42 });
```

### `Sentry`

Re-exported Sentry namespace for advanced usage.

## Invariants & Assumptions

- `initSentry()` must be called before any other Sentry API usage
- DSN is hardcoded; for multi-environment support, this could be made configurable
- Logging integration captures `warn` and `error` console calls automatically
- Source maps are uploaded during build via the Vite plugin
- Performance monitoring is enabled with `tracesSampleRate: 1.0` (100% of transactions captured)
- Browser tracing integration provides automatic instrumentation for page loads, navigation, and fetch/XHR requests
- `tracePropagationTargets` controls distributed tracing propagation; update the targets to match your actual API server URLs (accepts strings for exact/substring matching or RegExp patterns for complex matching)

## Configuration

The Sentry Vite plugin in `config/vite.config.ts` handles source map uploads
during production builds. This requires the `SENTRY_AUTH_TOKEN` environment
variable to be set in CI/CD.

## Tests

Since Sentry is a third-party service with side effects, we don't unit test
this module directly. Integration is verified by:

1. Building the app and checking source maps are uploaded
2. Triggering a test error in development and verifying it appears in Sentry
