# logger.ts

## Purpose

Configurable logging utility that provides a simple API with log levels. Also maintains an in-memory ring buffer of recent log entries for display in the expandable log panel UI (User Feedback Issue #5).

## Public API

### Types

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface LogEntry {
  timestamp: number; // Unix timestamp (Date.now())
  level: LogLevel;
  tag: string; // Source module
  message: string; // Stringified log content
}
```

### `createLogger(tag: string): Logger`

Creates a logger with a specific tag prefix.

```typescript
const log = createLogger('GPS');
log.info('Watch started'); // Console: [GPS] Watch started
log.error('Error:', err); // Console: [GPS] Error: <error details>
```

### `setGlobalLogLevel(level: LogLevel): void`

Sets the minimum log level. Messages below this level are not output to console (but still added to buffer).

### `getGlobalLogLevel(): LogLevel`

Returns the current global log level.

### `getLogBuffer(): LogEntry[]`

Returns a **copy** of the log buffer. Safe to mutate without affecting internal state.

### `clearLogBuffer(): void`

Clears all entries from the log buffer.

### `subscribeToLogs(callback: (entry: LogEntry) => void): () => void`

Subscribe to new log entries. Returns an unsubscribe function.

```typescript
const unsubscribe = subscribeToLogs((entry) => {
  console.log('New log:', entry.message);
});

// Later...
unsubscribe();
```

## Invariants & Assumptions

1. **Ring buffer limit:** Maximum 100 entries. When exceeded, oldest entries are dropped.

2. **Buffer vs Console:** All log calls add to buffer regardless of log level. Console output is filtered by `globalLogLevel`.

3. **Safe message serialization:** Arguments are serialized safely to strings:
   - **Error instances:** Serialized to JSON with `name`, `message`, `stack`, and any enumerable properties (e.g., `code`, `retryable`).
   - **Circular references:** Handled gracefully; cycles are replaced with `[Circular]` placeholder.
   - **Special types:** BigInt, Symbol, and functions are converted to descriptive strings.
   - **Null/undefined:** Converted to literal strings `"null"` and `"undefined"`.
   - **Fallback:** If serialization still fails, `[Unserializable]` is used.
   - **Logging never throws** due to serialization errors.

4. **Subscriber notification:** Subscribers are notified synchronously for each log call.

5. **Thread safety:** Not applicable (single-threaded JS), but care is taken to avoid mutation of returned buffer copies.

6. **Sentry integration:** All log levels add Sentry breadcrumbs for debugging context. When an exception is later captured, Sentry will show the trail of log messages leading up to it. Additionally:
   - `log.warn()` calls `Sentry.captureMessage(message, 'warning')` so warnings appear as standalone issues in the Sentry dashboard.
   - `log.error()` with Error objects automatically calls `Sentry.captureException()` to report the error to Sentry.

## Examples

```typescript
import {
  createLogger,
  LogLevel,
  setGlobalLogLevel,
  getLogBuffer,
} from './logger';

// Production: suppress debug logs in console
setGlobalLogLevel(LogLevel.INFO);

const log = createLogger('App');
log.debug('Verbose info'); // Not in console, but in buffer
log.info('App started'); // In console and buffer

// Access recent logs
const buffer = getLogBuffer();
console.log(`${buffer.length} log entries in buffer`);
```

## Tests

Unit tests in [logger.test.ts](logger.test.ts) cover:

- Logger creation with tag prefix
- Log level filtering for console output
- Ring buffer storage (100 entry limit)
- Buffer independence (returns copy)
- Buffer entries added regardless of log level
- Subscription and unsubscription
- Multiple subscriber support
- Safe serialization of Error instances (name, message, stack, enumerable props)
- Safe handling of circular references
- Graceful handling of null, undefined, BigInt, Symbol, and functions
- **Sentry integration:**
  - Breadcrumbs added for all log levels (debug, info, warn, error)
  - `captureMessage` called with `'warning'` level for `log.warn()`
  - `captureMessage` NOT called for debug/info/error logs
  - `captureException` called for Error objects in `log.error()`
  - Multiple Error objects in single `log.error()` call all reported
  - Non-Error arguments don't trigger `captureException`
  - `log.debug/info/warn` with Error objects don't trigger `captureException`
