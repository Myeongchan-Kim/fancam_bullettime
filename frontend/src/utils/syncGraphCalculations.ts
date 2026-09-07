import { SyncGraphVideoNode } from '../types';

/**
 * Calculates the local video playback time for a given master timeline cursor.
 * Handles split segmented videos, cut boundaries, and fallback offsets.
 */
export function calculateLocalSeekTime(
  video: SyncGraphVideoNode | null,
  currentCursor: number,
  delta: number = 0
): number {
  if (!video) return 0;

  if (video.segments && video.segments.length > 0) {
    // 1. Try finding segment containing currentCursor
    const activeSeg = video.segments.find(
      seg => currentCursor >= seg.master_start && currentCursor <= seg.master_end
    );
    if (activeSeg) {
      return Math.max(0, Math.floor(currentCursor - (activeSeg.sync_offset + delta)));
    }

    // 2. If cursor is between cut segments, find the closest upcoming segment
    const futureSegs = video.segments.filter(s => currentCursor < s.master_start);
    if (futureSegs.length > 0) {
      const nextSeg = [...futureSegs].sort((a, b) => a.master_start - b.master_start)[0];
      return Math.max(0, Math.floor(nextSeg.video_start));
    }

    // 3. If cursor is after all segments, clamp to the last segment's end
    const pastSegs = video.segments.filter(s => currentCursor > s.master_end);
    if (pastSegs.length > 0) {
      const lastSeg = [...pastSegs].sort((a, b) => b.master_end - a.master_end)[0];
      return Math.max(0, Math.floor(lastSeg.video_end));
    }
  }

  return Math.max(0, Math.floor(currentCursor - (video.sync_offset + delta)));
}

/**
 * Calculates master concert time from a local video playback timestamp.
 * Handles segment matching, inter-segment cut fallback, and scalar offsets.
 */
export function calculateMasterTimeFromLocal(
  video: SyncGraphVideoNode | null,
  localTime: number,
  totalDuration: number,
  delta: number = 0
): number {
  if (!video) return 0;

  if (video.segments && video.segments.length > 0) {
    // 1. Direct segment hit
    const seg = video.segments.find(
      s => localTime >= (s.video_start || 0) && localTime <= (s.video_end || video.duration || 300)
    );
    if (seg) {
      return Math.max(0, Math.min(totalDuration, localTime + seg.sync_offset + delta));
    }

    // 2. Fallback to closest segment based on localTime
    const sortedSegs = [...video.segments].sort((a, b) => a.video_start - b.video_start);
    if (localTime < sortedSegs[0].video_start) {
      return Math.max(0, Math.min(totalDuration, localTime + sortedSegs[0].sync_offset + delta));
    }
    for (let i = 0; i < sortedSegs.length - 1; i++) {
      if (localTime >= sortedSegs[i].video_end && localTime < sortedSegs[i + 1].video_start) {
        // Midpoint choice between two segments
        const useNext = (localTime - sortedSegs[i].video_end) > (sortedSegs[i + 1].video_start - localTime);
        const chosenSeg = useNext ? sortedSegs[i + 1] : sortedSegs[i];
        return Math.max(0, Math.min(totalDuration, localTime + chosenSeg.sync_offset + delta));
      }
    }
    const lastSeg = sortedSegs[sortedSegs.length - 1];
    return Math.max(0, Math.min(totalDuration, localTime + lastSeg.sync_offset + delta));
  }

  return Math.max(0, Math.min(totalDuration, localTime + (video.sync_offset || 0) + delta));
}

/**
 * Determines whether a given master timeline cursor falls inside a video's active playback range
 * (either continuous or segmented).
 */
export function isCursorInsideVideoRange(
  video: SyncGraphVideoNode,
  cursor: number
): boolean {
  if (video.segments && video.segments.length > 0) {
    return video.segments.some(s => cursor >= s.master_start && cursor <= s.master_end);
  }
  return cursor >= video.master_start_time && cursor <= video.master_end_time;
}
