/* eslint-disable no-console -- This IS the logging abstraction; console calls are intentional. */
/**
 * Configurable Logger Utility
 *
 * Provides a simple logging API with configurable log levels.
 * This allows disabling verbose logging in production while keeping
 * it available for development and debugging.
 *
 * Also maintains an in-memory ring buffer of recent log entries
 * for display in the expandable log panel UI.
 *
 * Sentry Integration:
 * - All log levels add Sentry breadcrumbs for debugging context
 * - log.error() with Error objects automatically reports to Sentry
 */

import * as Sentry from '@sentry/browser';

/**
 * Log levels in order of verbosity (lower = more verbose)
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Global log level - controls what gets logged across all loggers
 */
let globalLogLevel: LogLevel = LogLevel.DEBUG;

/**
 * Maximum number of log entries to keep in the ring buffer
 */
const LOG_BUFFER_MAX_SIZE = 100;

/**
 * Structure for a single log entry in the buffer
 */
export interface LogEntry {
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly tag: string;
  readonly message: string;
}

/**
 * In-memory ring buffer of recent log entries
 */
let logBuffer: LogEntry[] = [];

/**
 * Subscribers that get notified when new log entries are added
 */
type LogSubscriber = (entry: LogEntry) => void;
let subscribers: LogSubscriber[] = [];

/**
 * Serialize an Error instance to an object capturing name, message, stack,
 * and any enumerable properties.
 */
function serializeError(error: Error): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  // Copy enumerable properties (e.g., code, retryable)
  for (const key of Object.keys(error)) {
    result[key] = (error as unknown as Record<string, unknown>)[key];
  }
  return result;
}

/**
 * Safely stringify an object, handling circular references.
 * Uses a WeakSet to track seen objects and replaces cycles with a placeholder.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const replacer = (_key: string, val: unknown): unknown => {
    // Handle BigInt
    if (typeof val === 'bigint') {
      return val.toString();
    }
    // Handle objects (check for cycles)
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    return val;
  };

  try {
    return JSON.stringify(value, replacer);
  } catch {
    // Ultimate fallback if stringify still fails
    return '[Unserializable]';
  }
}

/**
 * Serialize a single argument to a string for the log buffer.
 * Special-cases Error instances and handles circular/complex objects safely.
 */
function serializeArg(arg: unknown): string {
  if (arg === null) {
    return 'null';
  }
  if (arg === undefined) {
    return 'undefined';
  }
  if (typeof arg === 'string') {
    return arg;
  }
  if (typeof arg === 'number' || typeof arg === 'boolean') {
    return String(arg);
  }
  if (typeof arg === 'bigint') {
    return arg.toString();
  }
  if (typeof arg === 'symbol') {
    return arg.toString();
  }
  if (typeof arg === 'function') {
    return arg.name ? `[Function: ${arg.name}]` : '[Function]';
  }
  if (arg instanceof Error) {
    return safeStringify(serializeError(arg));
  }
  // For other objects/arrays, use safe stringify
  return safeStringify(arg);
}

/**
 * Add an entry to the log buffer and notify subscribers
 */
function addToBuffer(level: LogLevel, tag: string, args: unknown[]): void {
  const message = args.map((arg) => serializeArg(arg)).join(' ');

  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    tag,
    message,
  };

  logBuffer.push(entry);

  // Ring buffer: remove oldest if over limit
  if (logBuffer.length > LOG_BUFFER_MAX_SIZE) {
    logBuffer.shift();
  }

  // Notify all subscribers (each wrapped in try/catch to prevent one failing subscriber from breaking others)
  for (const subscriber of subscribers) {
    try {
      subscriber(entry);
    } catch (err) {
      // Use console.error directly to avoid infinite recursion if our own logging fails
      console.error('[Logger] Subscriber threw an error:', err);
    }
  }
}

/**
 * Get a copy of the current log buffer
 * @returns Array of log entries (copy to prevent external mutation)
 */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/**
 * Clear all entries from the log buffer
 */
export function clearLogBuffer(): void {
  logBuffer = [];
}

/**
 * Subscribe to new log entries
 * @param callback - Function called when a new log entry is added
 * @returns Unsubscribe function
 */
export function subscribeToLogs(callback: LogSubscriber): () => void {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((sub) => sub !== callback);
  };
}

/**
 * Set the global log level
 * @param level - The minimum level to log
 */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Get the current global log level
 */
export function getGlobalLogLevel(): LogLevel {
  return globalLogLevel;
}

/**
 * Logger interface for type safety
 */
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Create a logger with a specific tag prefix
 * @param tag - The tag to prefix all log messages with (e.g., 'GPS', 'Storage')
 * @returns A logger object with debug, info, warn, error methods
 *
 * @example
 * ```typescript
 * const log = createLogger('GPS');
 * log.info('Watch started'); // [GPS] Watch started
 * log.error('Error:', err);  // [GPS] Error: <error details>
 * ```
 */
/**
 * Map LogLevel to Sentry breadcrumb severity.
 * Sentry uses 'warning' (not 'warn') for the warning level.
 */
function toSentryLevel(
  level: LogLevel
): 'debug' | 'info' | 'warning' | 'error' {
  switch (level) {
    case LogLevel.DEBUG:
      return 'debug';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.WARN:
      return 'warning';
    case LogLevel.ERROR:
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Add a Sentry breadcrumb for debugging context.
 * Breadcrumbs are attached to future exceptions, helping trace what happened before an error.
 */
function addSentryBreadcrumb(
  level: LogLevel,
  tag: string,
  args: unknown[]
): void {
  const message = `[${tag}] ${args.map((arg) => serializeArg(arg)).join(' ')}`;
  Sentry.addBreadcrumb({
    category: 'log',
    level: toSentryLevel(level),
    message,
  });
}

/**
 * Report a warning to Sentry as a standalone message.
 * Called for log.warn() so warnings are independently visible in the
 * Sentry dashboard, not only as breadcrumbs attached to later exceptions.
 */
function reportWarningToSentry(tag: string, args: unknown[]): void {
  const message = `[${tag}] ${args.map((arg) => serializeArg(arg)).join(' ')}`;
  Sentry.captureMessage(message, 'warning');
}

/**
 * Report Error objects to Sentry.
 * Only called for log.error() - other levels just add breadcrumbs.
 */
function reportErrorsToSentry(args: unknown[]): void {
  for (const arg of args) {
    if (arg instanceof Error) {
      Sentry.captureException(arg);
    }
  }
}

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;

  // Note: addToBuffer is called unconditionally (before the log level check) by design.
  // The ring buffer captures ALL log entries for the UI log panel, allowing users to
  // inspect debug-level details even when console output is configured for higher levels.
  // This separation provides maximum debugging capability without cluttering the console.
  //
  // Sentry breadcrumbs are also added unconditionally for all log levels.
  // This provides debugging context when exceptions are captured.
  return {
    debug: (...args: unknown[]): void => {
      addToBuffer(LogLevel.DEBUG, tag, args);
      addSentryBreadcrumb(LogLevel.DEBUG, tag, args);
      if (globalLogLevel <= LogLevel.DEBUG) {
        console.log(prefix, ...args);
      }
    },
    info: (...args: unknown[]): void => {
      addToBuffer(LogLevel.INFO, tag, args);
      addSentryBreadcrumb(LogLevel.INFO, tag, args);
      if (globalLogLevel <= LogLevel.INFO) {
        console.log(prefix, ...args);
      }
    },
    warn: (...args: unknown[]): void => {
      addToBuffer(LogLevel.WARN, tag, args);
      addSentryBreadcrumb(LogLevel.WARN, tag, args);
      // Report warnings as standalone Sentry messages for dashboard visibility
      reportWarningToSentry(tag, args);
      if (globalLogLevel <= LogLevel.WARN) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args: unknown[]): void => {
      addToBuffer(LogLevel.ERROR, tag, args);
      addSentryBreadcrumb(LogLevel.ERROR, tag, args);
      // Report Error objects to Sentry for visibility in dashboard
      reportErrorsToSentry(args);
      if (globalLogLevel <= LogLevel.ERROR) {
        console.error(prefix, ...args);
      }
    },
  };
}
