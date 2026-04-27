/**
 * Sentry Error Tracking Module
 *
 * Initializes and configures Sentry for error tracking, performance
 * monitoring, and logging in the RecorderApp.
 *
 * @see docs/sentry-instructions.md for usage patterns
 */

import * as Sentry from '@sentry/browser';

/**
 * Initialize Sentry SDK with error tracking and logging enabled.
 * Should be called as early as possible in the application lifecycle.
 */
export function initSentry(): void {
  Sentry.init({
    // DSN is hardcoded intentionally:
    // - This is a single-environment static frontend (no staging/prod distinction)
    // - DSN is not secret (Sentry docs confirm it's safe to expose in client code)
    // - Keeps setup minimal per project philosophy (AGENTS.md)
    // - If multi-environment support is needed later, use: import.meta.env.VITE_SENTRY_DSN || ''
    dsn: 'https://f45023a2803b24ca8cfe9e93362b909c@o369909.ingest.us.sentry.io/4510756888903680',

    // Send default PII data (e.g., automatic IP address collection)
    sendDefaultPii: true,

    // Performance monitoring: capture 100% of transactions
    tracesSampleRate: 1.0,

    // Trace propagation for local dev; add API URLs here if a backend is added
    tracePropagationTargets: ['localhost'],

    // Enable experimental logging feature
    _experiments: {
      enableLogs: true,
    },

    // Integrations for browser tracing and console logging
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
    ],
  });
}
