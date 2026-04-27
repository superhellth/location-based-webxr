# Logger Utility

## Purpose

A configurable logging utility that provides consistent log formatting with module tags and supports global log level control. This allows disabling verbose logging in production while keeping it available for development and debugging.

## Public API

### `LogLevel` (enum)

Log levels in order of verbosity:

- `LogLevel.DEBUG` (0) - Most verbose, for detailed debugging
- `LogLevel.INFO` (1) - General information messages
- `LogLevel.WARN` (2) - Warning messages
- `LogLevel.ERROR` (3) - Error messages only
- `LogLevel.SILENT` (4) - Suppress all logging

### `createLogger(tag: string): Logger`

Creates a logger instance with a specific tag prefix.

**Parameters:**

- `tag` - Module/component name to prefix messages (e.g., `'GPS'`, `'Storage'`)

**Returns:** Logger object with `debug`, `info`, `warn`, `error` methods

**Example:**

```typescript
import { createLogger } from './utils/logger';

const log = createLogger('GPS');
log.info('Watch started'); // [GPS] Watch started
log.error('Error:', err); // [GPS] Error: <error details>
log.debug('Position:', { lat, lon }); // [GPS] Position: { lat: ..., lon: ... }
```

### `setGlobalLogLevel(level: LogLevel): void`

Sets the minimum log level globally. Messages below this level are suppressed.

**Example:**

```typescript
import { setGlobalLogLevel, LogLevel } from './utils/logger';

// In production:
setGlobalLogLevel(LogLevel.WARN);

// In development:
setGlobalLogLevel(LogLevel.DEBUG);
```

### `getGlobalLogLevel(): LogLevel`

Returns the current global log level.

## Invariants & Assumptions

- **`LogEntry` is readonly** — log records are immutable once created. Type-level guard in `logger.test.ts` enforces this.
- Log level is a global setting affecting all logger instances
- Lower log level values mean more verbose output
- `DEBUG < INFO < WARN < ERROR < SILENT`
- Console methods (`log`, `warn`, `error`) are available (browser/Node.js)
- Tag prefix always appears in brackets: `[Tag]`

## Examples

### Basic Usage

```typescript
import { createLogger, setGlobalLogLevel, LogLevel } from './utils/logger';

const log = createLogger('MyModule');

log.debug('Starting initialization');
log.info('Module loaded successfully');
log.warn('Deprecated API used');
log.error('Failed to connect:', error);
```

### Conditional Logging in Production

```typescript
// At app startup
if (process.env.NODE_ENV === 'production') {
  setGlobalLogLevel(LogLevel.ERROR);
} else {
  setGlobalLogLevel(LogLevel.DEBUG);
}
```

### Multiple Loggers

```typescript
const gpsLog = createLogger('GPS');
const arLog = createLogger('AR');
const storageLog = createLogger('Storage');

gpsLog.info('Position updated'); // [GPS] Position updated
arLog.info('Session started'); // [AR] Session started
storageLog.warn('Low disk space'); // [Storage] Low disk space
```

## Tests

Covered by [logger.test.ts](./logger.test.ts):

- Logger creation with tag prefix
- Message prefixing with brackets
- Multiple argument support
- Log level hierarchy verification
- Each log level filtering (DEBUG, INFO, WARN, ERROR, SILENT)
- Global log level getter/setter
- Error object handling
