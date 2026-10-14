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
 * 
 * leadPadding: Allows upcoming videos (starting within leadPadding seconds) to be discovered and pre-buffered at t=0.
 * A video that has already finished its duration (local > duration) strictly returns null so it never bleeds into adjacent songs.
 */
export function getLocalVideoTime(
  video: Video,
  masterConcertTime: number,
  leadPadding: number = 0
): number | null {
  const duration = (video.duration && video.duration > 0) ? video.duration : 99999;

  if (video.sync_segments && video.sync_segments.length > 0) {
    const seg = video.sync_segments.find(
      s => masterConcertTime >= (s.master_start_time - leadPadding) &&
           masterConcertTime <= s.master_end_time
    );
    if (seg) {
      const local = masterConcertTime - seg.sync_offset;
      return (local >= -leadPadding && local <= duration) ? Math.max(0, local) : null;
    }
    return null;
  }

  // Fallback to classic scalar sync_offset
  const offset = video.sync_offset || 0;
  const local = masterConcertTime - offset;
  if (local >= -leadPadding && local <= duration) {
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
  leadPadding: number = 15
): boolean {
  return getLocalVideoTime(video, masterConcertTime, leadPadding) !== null;
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

export interface SlaveSyncEvaluationInput {
  slaveTime: number;
  targetSlaveTime: number;
  playerState: number; // YouTube PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
  msSinceLastSeek: number;
  isMobile: boolean;
  currentPlaybackRate?: number;
}

export interface SlaveSyncAction {
  shouldPlay: boolean;
  shouldSeek: boolean;
  targetPlaybackRate: number | null;
}

/**
 * Evaluates how a slave player should synchronize with the master timeline without causing
 * mobile seek-buffer spinner thrashing.
 *
 * - Protects buffering players (state === 3) from premature re-seeks that flush decoded buffers.
 * - Uses smooth playbackRate modulation (1.25x / 0.75x) for moderate drift (0.6s ~ threshold)
 *   so muted slave angles catch up seamlessly without triggering YouTube's loading spinner.
 * - Reserves hard seekTo() for large drift beyond threshold after respecting device cooldown.
 */
export function evaluateSlaveSyncAction({
  slaveTime,
  targetSlaveTime,
  playerState,
  msSinceLastSeek,
  isMobile,
  currentPlaybackRate = 1,
}: SlaveSyncEvaluationInput): SlaveSyncAction {
  const signedDrift = targetSlaveTime - slaveTime; // > 0: slave is behind master; < 0: slave is ahead
  const absDrift = Math.abs(signedDrift);

  const seekCooldownMs = isMobile ? 8000 : 4000;
  const hardSeekThreshold = isMobile ? 4.0 : 2.2;
  const rateAdjustThreshold = 0.6;

  // 1. Respect seek cooldown to let recent seeks finish decoding keyframes,
  //    but always start playback if player is paused (2), cued (5), or unstarted (-1)
  if (msSinceLastSeek < seekCooldownMs) {
    return {
      shouldPlay: playerState === 2 || playerState === 5 || playerState === -1,
      shouldSeek: false,
      targetPlaybackRate: null,
    };
  }

  // 2. Buffering guard: never flush an actively buffering stream (state === 3) unless severely stalled
  if (playerState === 3) {
    const extremeStallDrift = isMobile ? 15.0 : 8.0;
    const extremeStallCooldown = isMobile ? 12000 : 6000;
    if (absDrift > extremeStallDrift && msSinceLastSeek > extremeStallCooldown) {
      return {
        shouldPlay: false,
        shouldSeek: true,
        targetPlaybackRate: currentPlaybackRate !== 1 ? 1 : null,
      };
    }
    return {
      shouldPlay: false,
      shouldSeek: false,
      targetPlaybackRate: null,
    };
  }

  // 3. Paused (2), Cued (5), or Unstarted (-1) while master is playing: resume playback, only seek if drift is large
  if (playerState === 2 || playerState === 5 || playerState === -1) {
    const shouldSeek = absDrift > hardSeekThreshold;
    return {
      shouldPlay: true,
      shouldSeek,
      targetPlaybackRate: currentPlaybackRate !== 1 ? 1 : null,
    };
  }

  // 4. Playing (or unknown state): apply hard seek for large drift, playbackRate catch-up for moderate drift
  if (absDrift > hardSeekThreshold) {
    return {
      shouldPlay: false,
      shouldSeek: true,
      targetPlaybackRate: currentPlaybackRate !== 1 ? 1 : null,
    };
  }

  if (absDrift > rateAdjustThreshold) {
    const desiredRate = signedDrift > 0 ? 1.25 : 0.75;
    return {
      shouldPlay: false,
      shouldSeek: false,
      targetPlaybackRate: currentPlaybackRate !== desiredRate ? desiredRate : null,
    };
  }

  // Within 0.6s sync window: restore normal 1.0x speed if previously accelerated/decelerated
  return {
    shouldPlay: false,
    shouldSeek: false,
    targetPlaybackRate: currentPlaybackRate !== 1 ? 1 : null,
  };
}

