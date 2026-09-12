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
  delta: number = 0,
  minMasterTime: number = 0
): number {
  if (!video) return 0;

  if (video.segments && video.segments.length > 0) {
    // 1. Direct segment hit
    const seg = video.segments.find(
      s => localTime >= (s.video_start || 0) && localTime <= (s.video_end || video.duration || 300)
    );
    if (seg) {
      return Math.max(minMasterTime, Math.min(totalDuration, localTime + seg.sync_offset + delta));
    }

    // 2. Fallback to closest segment based on localTime
    const sortedSegs = [...video.segments].sort((a, b) => a.video_start - b.video_start);
    if (localTime < sortedSegs[0].video_start) {
      return Math.max(minMasterTime, Math.min(totalDuration, localTime + sortedSegs[0].sync_offset + delta));
    }
    for (let i = 0; i < sortedSegs.length - 1; i++) {
      if (localTime >= sortedSegs[i].video_end && localTime < sortedSegs[i + 1].video_start) {
        // Midpoint choice between two segments
        const useNext = (localTime - sortedSegs[i].video_end) > (sortedSegs[i + 1].video_start - localTime);
        const chosenSeg = useNext ? sortedSegs[i + 1] : sortedSegs[i];
        return Math.max(minMasterTime, Math.min(totalDuration, localTime + chosenSeg.sync_offset + delta));
      }
    }
    const lastSeg = sortedSegs[sortedSegs.length - 1];
    return Math.max(minMasterTime, Math.min(totalDuration, localTime + lastSeg.sync_offset + delta));
  }

  return Math.max(minMasterTime, Math.min(totalDuration, localTime + (video.sync_offset || 0) + delta));
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

/**
 * Finds the currently active segment for a video based on the master timeline cursor,
 * or the closest segment if the cursor is outside segments.
 */
export function getActiveSegment(
  video: SyncGraphVideoNode | null,
  cursor: number
) {
  if (!video || !video.segments || video.segments.length === 0) return null;

  // 1. Direct hit
  const direct = video.segments.find(
    s => cursor >= s.master_start && cursor <= s.master_end
  );
  if (direct) return direct;

  // 2. Upcoming closest segment
  const futureSegs = video.segments.filter(s => cursor < s.master_start);
  if (futureSegs.length > 0) {
    return [...futureSegs].sort((a, b) => a.master_start - b.master_start)[0];
  }

  // 3. Past closest segment
  const pastSegs = video.segments.filter(s => cursor > s.master_end);
  if (pastSegs.length > 0) {
    return [...pastSegs].sort((a, b) => b.master_end - a.master_end)[0];
  }

  return video.segments[0];
}

export interface SplitSegmentResult {
  success: boolean;
  error?: string;
  cutVideoTime?: number;
  newSegments?: {
    setlist_id: number | null;
    video_start_time: number;
    video_end_time: number;
    master_start_time: number;
    master_end_time: number;
    sync_offset: number;
    label: string | null;
    members: string[] | null;
    is_verified: boolean;
  }[];
}

/**
 * Splits a continuous video or an existing active segment into two pieces (left & right)
 * at the exact playback position corresponding to cursorTime in the master timeline.
 */
export function splitVideoSegmentAtCursor(params: {
  video: SyncGraphVideoNode;
  cursorTime: number;
  fineTuneDelta?: number;
  trimStartDelta?: number;
  trimEndDelta?: number;
  setlistItems?: { id: number; start_time: number | null; end_time: number | null }[];
}): SplitSegmentResult {
  const { video, cursorTime, fineTuneDelta = 0, trimStartDelta = 0, trimEndDelta = 0, setlistItems } = params;

  if (!video || video.is_master) {
    return { success: false, error: '마스터 영상은 분할할 수 없습니다.' };
  }

  const isSplitVideo = !!(video.segments && video.segments.length > 0);
  const activeSeg = isSplitVideo ? getActiveSegment(video, cursorTime) : null;

  const baseOffset = activeSeg ? activeSeg.sync_offset : (video.sync_offset || 0);
  const currentEffectiveOffset = Number((baseOffset + fineTuneDelta).toFixed(2));

  const baseVideoStart = activeSeg ? activeSeg.video_start : 0;
  const baseVideoEnd = activeSeg ? activeSeg.video_end : (video.duration || 240);

  const currentVideoStart = Math.max(0, baseVideoStart + trimStartDelta);
  const currentVideoEnd = Math.max(currentVideoStart + 0.5, baseVideoEnd + trimEndDelta);

  const rawCutVideoTime = cursorTime - currentEffectiveOffset;
  const cutVideoTime = Math.round(rawCutVideoTime * 10) / 10;

  const MIN_MARGIN = 0.5;
  if (cutVideoTime < currentVideoStart + MIN_MARGIN || cutVideoTime > currentVideoEnd - MIN_MARGIN) {
    return {
      success: false,
      error: `자르려는 위치(${cutVideoTime.toFixed(1)}s)가 구간 범위(${currentVideoStart.toFixed(1)}s ~ ${currentVideoEnd.toFixed(1)}s)를 벗어났거나 경계(0.5s)와 너무 가깝습니다.`,
      cutVideoTime
    };
  }

  const findSetlistId = (mStart: number, fallbackId?: number | null) => {
    if (!setlistItems || setlistItems.length === 0) return fallbackId || null;
    const match = setlistItems.find(
      s => s.start_time !== null && s.start_time <= mStart && (s.end_time ? s.end_time >= mStart : true)
    );
    return match ? match.id : (fallbackId || null);
  };

  const newSegments: Array<{
    setlist_id: number | null;
    video_start_time: number;
    video_end_time: number;
    master_start_time: number;
    master_end_time: number;
    sync_offset: number;
    label: string | null;
    members: string[] | null;
    is_verified: boolean;
  }> = [];

  if (!isSplitVideo) {
    const leftMasterStart = Math.round((currentVideoStart + currentEffectiveOffset) * 10) / 10;
    const leftMasterEnd = Math.round((cutVideoTime + currentEffectiveOffset) * 10) / 10;
    const rightMasterStart = Math.round((cutVideoTime + currentEffectiveOffset) * 10) / 10;
    const rightMasterEnd = Math.round((currentVideoEnd + currentEffectiveOffset) * 10) / 10;

    newSegments.push({
      setlist_id: findSetlistId(leftMasterStart),
      video_start_time: currentVideoStart,
      video_end_time: cutVideoTime,
      master_start_time: leftMasterStart,
      master_end_time: leftMasterEnd,
      sync_offset: currentEffectiveOffset,
      label: 'Part 1 (앞)',
      members: video.members && video.members.length > 0 ? video.members : null,
      is_verified: true
    });

    newSegments.push({
      setlist_id: findSetlistId(rightMasterStart),
      video_start_time: cutVideoTime,
      video_end_time: currentVideoEnd,
      master_start_time: rightMasterStart,
      master_end_time: rightMasterEnd,
      sync_offset: currentEffectiveOffset,
      label: 'Part 2 (뒤)',
      members: video.members && video.members.length > 0 ? video.members : null,
      is_verified: true
    });
  } else {
    for (let i = 0; i < video.segments.length; i++) {
      const s = video.segments[i];
      if (s.id === activeSeg?.id) {
        const leftMasterStart = Math.round((currentVideoStart + currentEffectiveOffset) * 10) / 10;
        const leftMasterEnd = Math.round((cutVideoTime + currentEffectiveOffset) * 10) / 10;
        const rightMasterStart = Math.round((cutVideoTime + currentEffectiveOffset) * 10) / 10;
        const rightMasterEnd = Math.round((currentVideoEnd + currentEffectiveOffset) * 10) / 10;

        const origLabel = s.label || `구간 ${i + 1}`;
        const baseName = origLabel.replace(/\s*\((앞|뒤|\d+)\)$/, '');
        const leftLabel = `${baseName} (앞)`;
        const rightLabel = `${baseName} (뒤)`;

        newSegments.push({
          setlist_id: findSetlistId(leftMasterStart, (s as any).setlist_id),
          video_start_time: currentVideoStart,
          video_end_time: cutVideoTime,
          master_start_time: leftMasterStart,
          master_end_time: leftMasterEnd,
          sync_offset: currentEffectiveOffset,
          label: leftLabel,
          members: s.members && s.members.length > 0 ? s.members : (video.members || null),
          is_verified: true
        });

        newSegments.push({
          setlist_id: findSetlistId(rightMasterStart, (s as any).setlist_id),
          video_start_time: cutVideoTime,
          video_end_time: currentVideoEnd,
          master_start_time: rightMasterStart,
          master_end_time: rightMasterEnd,
          sync_offset: currentEffectiveOffset,
          label: rightLabel,
          members: s.members && s.members.length > 0 ? s.members : (video.members || null),
          is_verified: true
        });
      } else {
        newSegments.push({
          setlist_id: (s as any).setlist_id || null,
          video_start_time: s.video_start,
          video_end_time: s.video_end,
          master_start_time: s.master_start,
          master_end_time: s.master_end,
          sync_offset: s.sync_offset,
          label: s.label || null,
          members: s.members && s.members.length > 0 ? s.members : null,
          is_verified: s.is_verified ?? true
        });
      }
    }
  }

  newSegments.sort((a, b) => a.video_start_time - b.video_start_time);

  return {
    success: true,
    cutVideoTime,
    newSegments
  };
}

