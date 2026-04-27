/**
 * Unit tests for Expandable Log Panel.
 *
 * TDD: These tests define the expected behavior for the log panel UI
 * that shows recent log entries when the user taps the status area.
 *
 * Why this test matters:
 * - User feedback Issue #5 requested a way to view detailed logs
 *   during field testing to verify everything is working correctly.
 * - The panel should be expandable (tap to show), scrollable,
 *   and update in real-time.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  initLogPanel,
  showLogPanel,
  hideLogPanel,
  isLogPanelVisible,
  toggleLogPanel,
  destroyLogPanel,
} from './log-panel.js';
import {
  clearLogBuffer,
  createLogger,
} from 'gps-plus-slam-app-framework/utils/logger';

/**
 * Creates DOM structure required for log panel.
 */
function setupLogPanelDOM(): void {
  document.body.innerHTML = `
    <div id="hud">
      <div id="status" title="Tap to toggle log panel">📋 Status: Ready</div>
    </div>
    <div id="log-panel" class="hidden">
      <div id="log-panel-header">
        <span>Logs</span>
        <button id="log-panel-close">×</button>
      </div>
      <div id="log-panel-content"></div>
    </div>
  `;
}

describe('Log Panel', () => {
  beforeEach(() => {
    setupLogPanelDOM();
    clearLogBuffer();
    vi.clearAllMocks();
  });

  afterEach(() => {
    destroyLogPanel();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('initLogPanel', () => {
    it('should throw if log-panel element is missing', () => {
      // Why: Fail-fast behavior consistent with other UI components
      document.body.innerHTML = '<div id="hud"></div>';

      expect(() => initLogPanel()).toThrow(/log-panel.*not found/i);
    });

    it('should throw if status element is missing', () => {
      // Why: Status element is needed for click-to-expand
      document.body.innerHTML = '<div id="log-panel"></div>';

      expect(() => initLogPanel()).toThrow(/status.*not found/i);
    });

    it('should wire up status click to toggle log panel', () => {
      // Why: User feedback: tap status to see logs
      initLogPanel();

      const status = document.getElementById('status')!;
      expect(isLogPanelVisible()).toBe(false);

      status.click();
      expect(isLogPanelVisible()).toBe(true);

      status.click();
      expect(isLogPanelVisible()).toBe(false);
    });

    it('should wire up close button to hide panel', () => {
      // Why: User needs a way to dismiss the panel
      initLogPanel();
      showLogPanel();

      const closeBtn = document.getElementById('log-panel-close')!;
      closeBtn.click();

      expect(isLogPanelVisible()).toBe(false);
    });
  });

  describe('showLogPanel / hideLogPanel', () => {
    beforeEach(() => {
      initLogPanel();
    });

    it('should show the log panel by removing hidden class', () => {
      const panel = document.getElementById('log-panel')!;
      expect(panel.classList.contains('hidden')).toBe(true);

      showLogPanel();
      expect(panel.classList.contains('hidden')).toBe(false);
    });

    it('should hide the log panel by adding hidden class', () => {
      showLogPanel();
      hideLogPanel();

      const panel = document.getElementById('log-panel')!;
      expect(panel.classList.contains('hidden')).toBe(true);
    });
  });

  describe('toggleLogPanel', () => {
    beforeEach(() => {
      initLogPanel();
    });

    it('should toggle panel visibility', () => {
      expect(isLogPanelVisible()).toBe(false);

      toggleLogPanel();
      expect(isLogPanelVisible()).toBe(true);

      toggleLogPanel();
      expect(isLogPanelVisible()).toBe(false);
    });
  });

  describe('log display', () => {
    beforeEach(() => {
      initLogPanel();
    });

    it('should display existing log buffer entries when shown', () => {
      // Why: Panel should show history, not just new entries
      const logger = createLogger('GPS');
      logger.info('Watch started');
      logger.warn('Low accuracy');

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.textContent).toContain('Watch started');
      expect(content.textContent).toContain('Low accuracy');
    });

    it('should display log level with appropriate styling', () => {
      // Why: Different levels should be visually distinguishable
      const logger = createLogger('Test');
      logger.error('Critical error');

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      const errorEntry = content.querySelector('.log-entry-error');
      expect(errorEntry).not.toBeNull();
      expect(errorEntry!.textContent).toContain('Critical error');
    });

    it('should display tag prefix for each entry', () => {
      // Why: User needs to know which component logged each message
      const logger = createLogger('Storage');
      logger.info('File saved');

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.textContent).toContain('[Storage]');
    });

    it('should display timestamp for each entry', () => {
      // Why: Timing info is essential for debugging
      const logger = createLogger('Test');
      logger.info('Test message');

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // Timestamp format: HH:MM:SS
      expect(content.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should update in real-time when new logs arrive', () => {
      // Why: Panel should show live updates while visible
      showLogPanel();

      const logger = createLogger('Live');
      logger.info('New message');

      const content = document.getElementById('log-panel-content')!;
      expect(content.textContent).toContain('New message');
    });

    it('should auto-scroll to bottom when user is already at bottom', () => {
      // Why: Latest logs are most relevant when user is following live
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // Mock scroll properties: user is at bottom
      Object.defineProperty(content, 'scrollHeight', {
        value: 500,
        writable: true,
      });
      Object.defineProperty(content, 'clientHeight', { value: 200 });
      content.scrollTop = 300; // At bottom: scrollTop + clientHeight = scrollHeight

      const logger = createLogger('Test');
      logger.info('New message');

      // scrollTop should be updated to scrollHeight (auto-scroll)
      expect(content.scrollTop).toBe(content.scrollHeight);
    });

    it('should NOT auto-scroll when user has scrolled up to read', () => {
      // Why: User feedback - don't yank user back to bottom while reading
      // older entries. This is the "sticky bottom" behavior.
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // Mock scroll properties: user has scrolled up (not at bottom)
      Object.defineProperty(content, 'scrollHeight', {
        value: 500,
        writable: true,
      });
      Object.defineProperty(content, 'clientHeight', { value: 200 });
      content.scrollTop = 100; // Scrolled up: 100 + 200 = 300 < 500

      const logger = createLogger('Test');
      logger.info('New message while reading');

      // scrollTop should NOT change - preserve user's scroll position
      expect(content.scrollTop).toBe(100);
    });

    it('should auto-scroll when user is within threshold of bottom', () => {
      // Why: Small scroll position imprecision shouldn't break auto-scroll.
      // If user is "close enough" to bottom (within 50px), still auto-scroll.
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // Mock scroll properties: user is 30px from bottom (within 50px threshold)
      Object.defineProperty(content, 'scrollHeight', {
        value: 500,
        writable: true,
      });
      Object.defineProperty(content, 'clientHeight', { value: 200 });
      content.scrollTop = 270; // 270 + 200 = 470, which is 30px from 500

      const logger = createLogger('Test');
      logger.info('New message');

      // Should still auto-scroll since within threshold
      expect(content.scrollTop).toBe(content.scrollHeight);
    });

    it('should not update DOM when panel is hidden', () => {
      // Why: Performance - no need to update invisible panel
      hideLogPanel();

      const content = document.getElementById('log-panel-content')!;
      const initialHTML = content.innerHTML;

      const logger = createLogger('Test');
      logger.info('Hidden message');

      // Content should not change while hidden
      expect(content.innerHTML).toBe(initialHTML);
    });
  });

  describe('log entry formatting', () => {
    beforeEach(() => {
      initLogPanel();
    });

    it('should apply correct CSS class for DEBUG level', () => {
      const logger = createLogger('Test');
      logger.debug('Debug message');
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.querySelector('.log-entry-debug')).not.toBeNull();
    });

    it('should apply correct CSS class for INFO level', () => {
      const logger = createLogger('Test');
      logger.info('Info message');
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.querySelector('.log-entry-info')).not.toBeNull();
    });

    it('should apply correct CSS class for WARN level', () => {
      const logger = createLogger('Test');
      logger.warn('Warn message');
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.querySelector('.log-entry-warn')).not.toBeNull();
    });

    it('should apply correct CSS class for ERROR level', () => {
      const logger = createLogger('Test');
      logger.error('Error message');
      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      expect(content.querySelector('.log-entry-error')).not.toBeNull();
    });
  });

  describe('XSS prevention', () => {
    /**
     * Why this test matters:
     * Log messages may contain user-provided data (file names, error messages
     * from external sources, parsed content). Using innerHTML with unescaped
     * content allows script injection. We must ensure HTML in messages is
     * displayed as plain text, not interpreted as markup.
     */
    beforeEach(() => {
      initLogPanel();
    });

    it('should escape HTML in log messages to prevent XSS', () => {
      const logger = createLogger('Test');
      const maliciousMessage = '<script>alert("xss")</script>';
      logger.info(maliciousMessage);

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // The script tag should be visible as text, not executed/parsed as HTML
      expect(content.textContent).toContain('<script>');
      // No actual script element should exist
      expect(content.querySelector('script')).toBeNull();
    });

    it('should escape HTML in log tags to prevent XSS', () => {
      const logger = createLogger('<img src=x onerror=alert(1)>');
      logger.info('Test message');

      showLogPanel();

      const content = document.getElementById('log-panel-content')!;
      // The img tag should be visible as text, not parsed as HTML
      expect(content.textContent).toContain('<img');
      // No actual img element should exist
      expect(content.querySelector('img')).toBeNull();
    });

    it('should escape HTML in live-appended log entries', () => {
      // Why: Both initial render and live updates must be safe
      showLogPanel();

      const logger = createLogger('Test');
      const maliciousMessage = '<div onclick="evil()">click me</div>';
      logger.info(maliciousMessage);

      const content = document.getElementById('log-panel-content')!;
      // Should show as text, not as a clickable div
      expect(content.textContent).toContain('<div onclick');
      // Should not create an actual div with onclick
      const divs = content.querySelectorAll('div[onclick]');
      expect(divs.length).toBe(0);
    });
  });
});
