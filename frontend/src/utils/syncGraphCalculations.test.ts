import { describe, it, expect } from 'vitest';
import { 
  calculateLocalSeekTime, 
  calculateMasterTimeFromLocal, 
  isCursorInsideVideoRange,
  getActiveSegment,
  splitVideoSegmentAtCursor
} from './syncGraphCalculations';
import { SyncGraphVideoNode } from '../types';

describe('syncGraphCalculations Unit Tests', () => {
  const continuousVideo = {
    id: 101,
    youtube_id: 'vid_cont_101',
    title: 'Momo Focus - Continuous',
    sync_offset: 1000,
    duration: 200,
    master_start_time: 1000,
    master_end_time: 1200,
    is_master: false,
    status: 'verified',
    calibration_count: 2,
    members: ['Momo'],
    songs: [{ id: 1, name: 'Touchdown', is_solo: false }],
    status_reason: undefined,
    segments: []
  } as unknown as SyncGraphVideoNode;

  const splitVideo = {
    id: 1714,
    youtube_id: 'vid_split_1714',
    title: 'Medley Opening - 3 Parts',
    sync_offset: 0,
    duration: 564,
    master_start_time: 0,
    master_end_time: 564,
    is_master: false,
    status: 'verified',
    calibration_count: 1,
    members: ['All'],
    songs: [
      { id: 2, name: 'FOUR', is_solo: false },
      { id: 3, name: 'THIS IS FOR', is_solo: false },
      { id: 4, name: 'STRATEGY', is_solo: false }
    ],
    status_reason: undefined,
    segments: [
      {
        id: 1,
        video_start: 0,
        video_end: 231,
        master_start: 0,
        master_end: 231,
        sync_offset: 0,
        label: 'Part 1 (FOUR)'
      },
      {
        id: 2,
        video_start: 231,
        video_end: 394,
        master_start: 300, // 69s cut gap in master
        master_end: 463,
        sync_offset: 69,
        label: 'Part 2 (THIS IS FOR)'
      },
      {
        id: 3,
        video_start: 394,
        video_end: 564,
        master_start: 600,
        master_end: 770,
        sync_offset: 206,
        label: 'Part 3 (STRATEGY)'
      }
    ]
  } as unknown as SyncGraphVideoNode;

  describe('calculateLocalSeekTime', () => {
    it('returns 0 for null video', () => {
      expect(calculateLocalSeekTime(null, 500)).toBe(0);
    });

    it('calculates continuous video local seek time correctly', () => {
      expect(calculateLocalSeekTime(continuousVideo, 1050)).toBe(50);
      expect(calculateLocalSeekTime(continuousVideo, 1050, 5)).toBe(45);
      expect(calculateLocalSeekTime(continuousVideo, 950)).toBe(0);
    });

    it('calculates split video local seek time when cursor is inside a segment', () => {
      expect(calculateLocalSeekTime(splitVideo, 100)).toBe(100);
      expect(calculateLocalSeekTime(splitVideo, 350)).toBe(281);
      expect(calculateLocalSeekTime(splitVideo, 650)).toBe(444);
    });

    it('bridges inter-segment cut gaps by auto-jumping to next segment start', () => {
      expect(calculateLocalSeekTime(splitVideo, 250)).toBe(231);
    });

    it('clamps to last segment end if cursor is beyond all segments', () => {
      expect(calculateLocalSeekTime(splitVideo, 900)).toBe(564);
    });
  });

  describe('calculateMasterTimeFromLocal', () => {
    it('returns 0 for null video', () => {
      expect(calculateMasterTimeFromLocal(null, 50, 10000)).toBe(0);
    });

    it('calculates continuous video master time correctly', () => {
      expect(calculateMasterTimeFromLocal(continuousVideo, 50, 10000)).toBe(1050);
      expect(calculateMasterTimeFromLocal(continuousVideo, 50, 10000, 2.5)).toBe(1052.5);
    });

    it('calculates split video master time inside active segments', () => {
      expect(calculateMasterTimeFromLocal(splitVideo, 100, 10000)).toBe(100);
      expect(calculateMasterTimeFromLocal(splitVideo, 300, 10000)).toBe(369);
    });

    it('clamps to total duration', () => {
      expect(calculateMasterTimeFromLocal(continuousVideo, 5000, 2000)).toBe(2000);
    });
  });

  describe('isCursorInsideVideoRange', () => {
    it('checks continuous video range accurately', () => {
      expect(isCursorInsideVideoRange(continuousVideo, 1050)).toBe(true);
      expect(isCursorInsideVideoRange(continuousVideo, 999)).toBe(false);
      expect(isCursorInsideVideoRange(continuousVideo, 1201)).toBe(false);
    });

    it('checks split video range accurately (ignoring cut gaps)', () => {
      expect(isCursorInsideVideoRange(splitVideo, 100)).toBe(true);
      expect(isCursorInsideVideoRange(splitVideo, 250)).toBe(false);
      expect(isCursorInsideVideoRange(splitVideo, 350)).toBe(true);
      expect(isCursorInsideVideoRange(splitVideo, 550)).toBe(false);
      expect(isCursorInsideVideoRange(splitVideo, 650)).toBe(true);
    });
  });

  describe('getActiveSegment', () => {
    it('returns null for videos without segments', () => {
      expect(getActiveSegment(continuousVideo, 1050)).toBeNull();
      expect(getActiveSegment(null, 100)).toBeNull();
    });

    it('returns direct matching segment when cursor is inside it', () => {
      const seg1 = getActiveSegment(splitVideo, 100);
      expect(seg1?.id).toBe(1);
      const seg2 = getActiveSegment(splitVideo, 350);
      expect(seg2?.id).toBe(2);
      const seg3 = getActiveSegment(splitVideo, 650);
      expect(seg3?.id).toBe(3);
    });

    it('returns closest upcoming segment when cursor is in a gap', () => {
      const seg = getActiveSegment(splitVideo, 250);
      expect(seg?.id).toBe(2);
    });

    it('returns last segment when cursor is past all segments', () => {
      const seg = getActiveSegment(splitVideo, 900);
      expect(seg?.id).toBe(3);
    });
  });

  describe('splitVideoSegmentAtCursor', () => {
    it('fails if video is master or invalid', () => {
      const master = { ...continuousVideo, is_master: true };
      const res = splitVideoSegmentAtCursor({ video: master, cursorTime: 1050 });
      expect(res.success).toBe(false);
      expect(res.error).toContain('마스터');
    });

    it('splits a continuous video into 2 parts', () => {
      // continuousVideo: offset = 1000, duration = 200 (range: 1000 ~ 1200)
      // Cut at master time 1050 => local video cut time = 50.0
      const res = splitVideoSegmentAtCursor({
        video: continuousVideo,
        cursorTime: 1050
      });

      expect(res.success).toBe(true);
      expect(res.cutVideoTime).toBe(50.0);
      expect(res.newSegments).toHaveLength(2);

      const [left, right] = res.newSegments!;
      expect(left.video_start_time).toBe(0);
      expect(left.video_end_time).toBe(50.0);
      expect(left.master_start_time).toBe(1000);
      expect(left.master_end_time).toBe(1050);
      expect(left.sync_offset).toBe(1000);
      expect(left.label).toBe('Part 1 (앞)');

      expect(right.video_start_time).toBe(50.0);
      expect(right.video_end_time).toBe(200);
      expect(right.master_start_time).toBe(1050);
      expect(right.master_end_time).toBe(1200);
      expect(right.sync_offset).toBe(1000);
      expect(right.label).toBe('Part 2 (뒤)');
    });

    it('accounts for fineTuneDelta when splitting continuous video', () => {
      // fineTuneDelta = +10 => effective offset = 1010
      // Cut at cursor 1060 => local video time = 1060 - 1010 = 50.0
      const res = splitVideoSegmentAtCursor({
        video: continuousVideo,
        cursorTime: 1060,
        fineTuneDelta: 10
      });

      expect(res.success).toBe(true);
      expect(res.cutVideoTime).toBe(50.0);
      const [left, right] = res.newSegments!;
      expect(left.sync_offset).toBe(1010);
      expect(left.master_start_time).toBe(1010);
      expect(left.master_end_time).toBe(1060);
      expect(right.sync_offset).toBe(1010);
      expect(right.master_start_time).toBe(1060);
      expect(right.master_end_time).toBe(1210);
    });

    it('splits an existing segment within a multi-segment video', () => {
      // splitVideo Part 1: video 0~231, master 0~231, offset 0
      // Cut at cursor 100 => local cut 100
      const res = splitVideoSegmentAtCursor({
        video: splitVideo,
        cursorTime: 100
      });

      expect(res.success).toBe(true);
      expect(res.cutVideoTime).toBe(100);
      // Original had 3 segments, Part 1 splits into 2, total 4
      expect(res.newSegments).toHaveLength(4);

      const [seg1, seg2, seg3, seg4] = res.newSegments!;
      expect(seg1.label).toBe('Part 1 (FOUR) (앞)');
      expect(seg1.video_start_time).toBe(0);
      expect(seg1.video_end_time).toBe(100);
      expect(seg1.sync_offset).toBe(0);

      expect(seg2.label).toBe('Part 1 (FOUR) (뒤)');
      expect(seg2.video_start_time).toBe(100);
      expect(seg2.video_end_time).toBe(231);
      expect(seg2.sync_offset).toBe(0);

      // Other segments remain untouched
      expect(seg3.video_start_time).toBe(231);
      expect(seg3.video_end_time).toBe(394);
      expect(seg3.sync_offset).toBe(69);

      expect(seg4.video_start_time).toBe(394);
      expect(seg4.video_end_time).toBe(564);
    });

    it('rejects cut if cursor is too close to boundary (<0.5s)', () => {
      // splitVideo Part 1: video 0~231, offset 0.
      // Cursor 0.2s is too close to start (0s)
      const res = splitVideoSegmentAtCursor({
        video: splitVideo,
        cursorTime: 0.2
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('경계');
    });

    it('preserves trimStartDelta and trimEndDelta when splitting', () => {
      // continuousVideo: dur=200, offset=1000
      // trimStart = +10, trimEnd = -20 => video start = 10, video end = 180
      // cursorTime = 1050 => local = 50.0
      const res = splitVideoSegmentAtCursor({
        video: continuousVideo,
        cursorTime: 1050,
        trimStartDelta: 10,
        trimEndDelta: -20
      });

      expect(res.success).toBe(true);
      const [left, right] = res.newSegments!;
      expect(left.video_start_time).toBe(10);
      expect(left.video_end_time).toBe(50.0);
      expect(right.video_start_time).toBe(50.0);
      expect(right.video_end_time).toBe(180);
    });
  });
});

