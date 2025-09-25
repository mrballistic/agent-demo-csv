import { describe, it, expect } from 'vitest';
import {
  generateChartAltText,
  KeyboardNavigation,
  announceToScreenReader,
  srOnlyStyles,
} from '../accessibility';

describe('Accessibility Utilities', () => {
  describe('generateChartAltText', () => {
    it('should generate basic alt text for charts', () => {
      const manifest = {
        metadata: {
          analysis_type: 'trend',
          columns_used: ['date', 'revenue'],
        },
      };

      const altText = generateChartAltText(manifest);
      expect(altText).toBe(
        'Chart showing trend analysis based on date, revenue data'
      );
    });

    it('should include insight in alt text', () => {
      const manifest = {
        insight: 'Revenue increased by 25% over the quarter',
        metadata: {
          analysis_type: 'trend',
          columns_used: ['date', 'revenue'],
        },
      };

      const altText = generateChartAltText(manifest);
      expect(altText).toBe(
        'Chart showing trend analysis based on date, revenue data. Key finding: Revenue increased by 25% over the quarter'
      );
    });

    it('should handle missing metadata gracefully', () => {
      const manifest = {};
      const altText = generateChartAltText(manifest);
      expect(altText).toBe('Chart showing analysis analysis');
    });

    it('should clean up multiline insights', () => {
      const manifest = {
        insight: 'Revenue increased\nby 25% over\nthe quarter',
        metadata: {
          analysis_type: 'profile',
        },
      };

      const altText = generateChartAltText(manifest);
      expect(altText).toBe(
        'Chart showing profile analysis. Key finding: Revenue increased by 25% over the quarter'
      );
    });
  });

  describe('KeyboardNavigation', () => {
    it('should handle empty elements array', () => {
      const cleanup = KeyboardNavigation.setupRovingTabIndex([], 0);
      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw
    });

    it('should set initial tabindex correctly', () => {
      const elements = [
        document.createElement('button'),
        document.createElement('button'),
        document.createElement('button'),
      ];

      const cleanup = KeyboardNavigation.setupRovingTabIndex(elements, 1);

      expect(elements[0]?.tabIndex).toBe(-1);
      expect(elements[1]?.tabIndex).toBe(0);
      expect(elements[2]?.tabIndex).toBe(-1);

      cleanup();
    });
  });

  describe('announceToScreenReader', () => {
    it('should create and remove announcement element', () => {
      const initialCount = document.querySelectorAll('[aria-live]').length;

      announceToScreenReader('Test message', 'polite');

      const announcements = document.querySelectorAll('[aria-live="polite"]');
      expect(announcements.length).toBe(initialCount + 1);

      const announcement = announcements[announcements.length - 1];
      expect(announcement?.textContent).toBe('Test message');
      expect(announcement?.getAttribute('aria-atomic')).toBe('true');
    });

    it('should support assertive priority', () => {
      announceToScreenReader('Urgent message', 'assertive');

      const announcements = document.querySelectorAll(
        '[aria-live="assertive"]'
      );
      expect(announcements.length).toBeGreaterThan(0);

      const announcement = announcements[announcements.length - 1];
      expect(announcement?.textContent).toBe('Urgent message');
    });
  });

  describe('srOnlyStyles', () => {
    it('should provide screen reader only styles', () => {
      expect(srOnlyStyles.position).toBe('absolute');
      expect(srOnlyStyles.width).toBe('1px');
      expect(srOnlyStyles.height).toBe('1px');
      expect(srOnlyStyles.overflow).toBe('hidden');
      expect(srOnlyStyles.clip).toBe('rect(0, 0, 0, 0)');
    });
  });
});
