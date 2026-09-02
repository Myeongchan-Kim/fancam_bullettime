import { Video } from '../types';

/**
 * Converts a video's local playback timestamp (t_video) into Master Concert Timeline time (T_master).
 * 
 * 1. If the video has segmented timeline mappings (sync_segments), finds the matching segment.
 * 2. If no segment matches or segments are empty, falls back to scalar video.sync_offset.
 */
export function getMasterConcertTime(video: Video, localTime: number): number {
  if (video.sync_segments && video.sync_segments.length > 0) {
    const seg = video.sync_segments.find(
      s => localTime >= s.video_start_time && localTime <= s.video_end_time
    );
    if (seg) {
      return localTime + seg.sync_offset;
    }
    
    // If before first segment
    if (localTime < video.sync_segments[0].video_start_time) {
      return localTime + video.sync_segments[0].sync_offset;
    }
    
    // If after last segment
    const lastSeg = video.sync_segments[video.sync_segments.length - 1];
    if (localTime > lastSeg.video_end_time) {
      return localTime + lastSeg.sync_offset;
    }

    // If in between segments, find closest preceding segment
    for (let i = video.sync_segments.length - 1; i >= 0; i--) {
      if (localTime >= video.sync_segments[i].video_end_time) {
        return localTime + video.sync_segments[i].sync_offset;
      }
    }
  }

  // Fallback to classic scalar sync_offset
  return localTime + (video.sync_offset || 0);
}

/**
 * Converts Master Concert Timeline time (T_master) into a video's local playback timestamp (t_video).
 * Returns null if the video does not cover the requested master concert time (e.g. cut/skipped/out of bounds).
 */
export function getLocalVideoTime(
  video: Video,
  masterConcertTime: number,
  padding: number = 0
): number | null {
  const duration = (video.duration && video.duration > 0) ? video.duration : 99999;

  if (video.sync_segments && video.sync_segments.length > 0) {
    const seg = video.sync_segments.find(
      s => masterConcertTime >= (s.master_start_time - padding) &&
           masterConcertTime <= (s.master_end_time + padding)
    );
    if (seg) {
      const local = masterConcertTime - seg.sync_offset;
      return (local >= -padding && local <= duration + padding) ? Math.max(0, local) : null;
    }
    return null;
  }

  // Fallback to classic scalar sync_offset
  const offset = video.sync_offset || 0;
  const local = masterConcertTime - offset;
  if (local >= -padding && local <= duration + padding) {
    return Math.max(0, local);
  }
  return null;
}

/**
 * Checks if a video has valid footage active at the given Master Concert Timeline time.
 */
export function isVideoActiveAtConcertTime(
  video: Video,
  masterConcertTime: number,
  padding: number = 30
): boolean {
  return getLocalVideoTime(video, masterConcertTime, padding) !== null;
}

/**
 * Returns all continuous active Master Concert Timeline intervals for this video.
 */
export function getConcertTimeIntervals(
  video: Video
): { start: number; end: number; label?: string | null }[] {
  if (video.sync_segments && video.sync_segments.length > 0) {
    return video.sync_segments.map(s => ({
      start: s.master_start_time,
      end: s.master_end_time,
      label: s.label
    }));
  }

  const offset = video.sync_offset || 0;
  const duration = (video.duration && video.duration > 0) ? video.duration : 300;
  return [{
    start: offset,
    end: offset + duration,
    label: video.title
  }];
}
