/**
 * Shared formatting utilities for time and durations across the frontend.
 */

export interface FormatTimeOptions {
  showDecimals?: boolean;
  decimals?: number;
  forceHours?: boolean;
}

/**
 * Formats seconds into MM:SS, HH:MM:SS, or MM:SS.d / MM:SS.dd.
 */
export function formatTime(seconds: number | null | undefined, options: FormatTimeOptions = {}): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return options.showDecimals
      ? `00:00.${'0'.repeat(options.decimals ?? 1)}`
      : options.forceHours
        ? '0:00:00'
        : '00:00';
  }

  const { showDecimals = false, decimals = 1, forceHours = false } = options;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  let base: string;
  if (h > 0 || forceHours) {
    base = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    base = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  if (showDecimals) {
    const factor = Math.pow(10, decimals);
    const frac = Math.floor(Math.round((seconds % 1) * factor));
    const clampedFrac = Math.min(factor - 1, Math.max(0, frac));
    return `${base}.${clampedFrac.toString().padStart(decimals, '0')}`;
  }

  return base;
}

/**
 * Formats a video duration in seconds into M:SS or H:MM:SS (compact minutes when < 1 hour).
 */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
