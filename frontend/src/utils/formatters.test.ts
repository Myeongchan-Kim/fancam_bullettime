import { describe, it, expect } from 'vitest';
import { formatTime, formatDuration } from './formatters';

describe('formatters', () => {
  describe('formatTime', () => {
    it('formats standard MM:SS and HH:MM:SS', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(65)).toBe('01:05');
      expect(formatTime(3661)).toBe('1:01:01');
    });

    it('handles decimals when showDecimals is enabled', () => {
      expect(formatTime(65.4, { showDecimals: true, decimals: 1 })).toBe('01:05.4');
      expect(formatTime(12.34, { showDecimals: true, decimals: 2 })).toBe('00:12.34');
    });

    it('handles negative or invalid inputs gracefully', () => {
      expect(formatTime(-5)).toBe('00:00');
      expect(formatTime(NaN)).toBe('00:00');
      expect(formatTime(null)).toBe('00:00');
    });
  });

  describe('formatDuration', () => {
    it('formats compact durations', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(95)).toBe('1:35');
      expect(formatDuration(3665)).toBe('1:01:05');
    });
  });
});
