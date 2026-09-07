import { describe, it, expect } from 'vitest';
import { 
  getMasterConcertTime, 
  getLocalVideoTime, 
  isVideoActiveAtConcertTime, 
  getConcertTimeIntervals 
} from './timelineSync';
import { Video } from '../types';

describe('timelineSync legacy utilities tests', () => {
  const mockVideo = {
    id: 1,
    youtube_id: 'test_yt_1',
    title: 'Test Continuous',
    sync_offset: 500,
    duration: 180,
    sync_segments: []
  } as unknown as Video;

  const mockSegmentedVideo = {
    id: 2,
    youtube_id: 'test_yt_2',
    title: 'Test Segmented',
    sync_offset: 0,
    duration: 300,
    sync_segments: [
      {
        id: 1,
        video_id: 2,
        video_start_time: 0,
        video_end_time: 100,
        master_start_time: 1000,
        master_end_time: 1100,
        sync_offset: 1000,
        label: 'Seg 1'
      },
      {
        id: 2,
        video_id: 2,
        video_start_time: 100,
        video_end_time: 200,
        master_start_time: 1200,
        master_end_time: 1300,
        sync_offset: 1100,
        label: 'Seg 2'
      }
    ]
  } as unknown as Video;

  it('converts local to master time for continuous video', () => {
    expect(getMasterConcertTime(mockVideo, 30)).toBe(530);
  });

  it('converts local to master time across segments', () => {
    expect(getMasterConcertTime(mockSegmentedVideo, 50)).toBe(1050);
    expect(getMasterConcertTime(mockSegmentedVideo, 150)).toBe(1250);
  });

  it('converts master to local time', () => {
    expect(getLocalVideoTime(mockVideo, 550)).toBe(50);
    expect(getLocalVideoTime(mockVideo, 400)).toBeNull(); // out of bounds
  });

  it('checks active video at concert time', () => {
    expect(isVideoActiveAtConcertTime(mockVideo, 550)).toBe(true);
    expect(isVideoActiveAtConcertTime(mockVideo, 200)).toBe(false);
  });

  it('generates intervals', () => {
    const intervals = getConcertTimeIntervals(mockSegmentedVideo);
    expect(intervals.length).toBe(2);
    expect(intervals[0].start).toBe(1000);
    expect(intervals[1].start).toBe(1200);
  });
});
