import { describe, it, expect } from 'vitest';
import { isVerticalVideo, getVideoAspectRatio, packMobileTiles } from './tilePacker';
import { Video } from '../types';

function createMockVideo(id: number, overrides: Partial<Video> = {}): Video {
  return {
    id,
    youtube_id: `yt-${id}`,
    title: `Fancam ${id}`,
    thumbnail_url: `https://img.youtube.com/vi/yt-${id}/0.jpg`,
    url: `https://youtube.com/watch?v=yt-${id}`,
    members: ['Nayeon'],
    angle: 'North (Front)',
    coordinate_x: 0,
    coordinate_y: 0,
    sync_offset: 0,
    duration: 200,
    is_shorts: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('tilePacker', () => {
  describe('isVerticalVideo & getVideoAspectRatio', () => {
    it('detects vertical video via aspect_ratio < 0.9', () => {
      const v = createMockVideo(1, { aspect_ratio: 0.5625 });
      expect(isVerticalVideo(v)).toBe(true);
      expect(getVideoAspectRatio(v)).toBe(0.5625);
    });

    it('detects horizontal video via aspect_ratio >= 0.9', () => {
      const v = createMockVideo(2, { aspect_ratio: 1.7778 });
      expect(isVerticalVideo(v)).toBe(false);
      expect(getVideoAspectRatio(v)).toBe(1.7778);
    });

    it('detects vertical video via height > width', () => {
      const v = createMockVideo(3, { width: 1080, height: 1920 });
      expect(isVerticalVideo(v)).toBe(true);
    });

    it('detects vertical video via is_shorts flag', () => {
      const v = createMockVideo(4, { is_shorts: true });
      expect(isVerticalVideo(v)).toBe(true);
      expect(getVideoAspectRatio(v)).toBe(0.5625);
    });

    it('detects vertical video via title keywords', () => {
      const v = createMockVideo(5, { title: 'TWICE 세로직캠 4K' });
      expect(isVerticalVideo(v)).toBe(true);
    });
  });

  describe('packMobileTiles - Portrait Mode', () => {
    it('packs 3 vertical slaves into a grid-cols-3 trio', () => {
      const master = createMockVideo(1, { aspect_ratio: 1.7778 });
      const slave1 = createMockVideo(2, { aspect_ratio: 0.5625 });
      const slave2 = createMockVideo(3, { aspect_ratio: 0.5625 });
      const slave3 = createMockVideo(4, { aspect_ratio: 0.5625 });

      const groups = packMobileTiles(master, [slave1, slave2, slave3], false);

      expect(groups).toHaveLength(2);
      expect(groups[0].type).toBe('master');
      expect(groups[1].type).toBe('vertical_trio');
      expect(groups[1].gridColsClass).toBe('grid-cols-3');
      expect(groups[1].tiles).toHaveLength(3);
    });

    it('packs 2 vertical slaves into a grid-cols-2 pair', () => {
      const master = createMockVideo(1, { aspect_ratio: 1.7778 });
      const slave1 = createMockVideo(2, { aspect_ratio: 0.5625 });
      const slave2 = createMockVideo(3, { aspect_ratio: 0.5625 });

      const groups = packMobileTiles(master, [slave1, slave2], false);

      expect(groups).toHaveLength(2);
      expect(groups[1].type).toBe('vertical_pair');
      expect(groups[1].gridColsClass).toBe('grid-cols-2');
      expect(groups[1].tiles).toHaveLength(2);
    });

    it('packs horizontal slaves into pairs', () => {
      const master = createMockVideo(1, { aspect_ratio: 1.7778 });
      const slave1 = createMockVideo(2, { aspect_ratio: 1.7778 });
      const slave2 = createMockVideo(3, { aspect_ratio: 1.7778 });
      const slave3 = createMockVideo(4, { aspect_ratio: 1.7778 });

      const groups = packMobileTiles(master, [slave1, slave2, slave3], false);

      expect(groups).toHaveLength(3); // master, h-pair (2), h-single (1)
      expect(groups[0].type).toBe('master');
      expect(groups[1].type).toBe('horizontal_pair');
      expect(groups[1].gridColsClass).toBe('grid-cols-2');
      expect(groups[2].type).toBe('horizontal_single');
      expect(groups[2].gridColsClass).toBe('grid-cols-1');
    });

    it('handles mixed vertical and horizontal slaves neatly', () => {
      const master = createMockVideo(1, { aspect_ratio: 1.7778 });
      const v1 = createMockVideo(2, { aspect_ratio: 0.5625 });
      const v2 = createMockVideo(3, { aspect_ratio: 0.5625 });
      const v3 = createMockVideo(4, { aspect_ratio: 0.5625 });
      const h1 = createMockVideo(5, { aspect_ratio: 1.7778 });
      const h2 = createMockVideo(6, { aspect_ratio: 1.7778 });

      const groups = packMobileTiles(master, [v1, h1, v2, h2, v3], false);

      expect(groups).toHaveLength(3);
      expect(groups[0].type).toBe('master');
      expect(groups[1].type).toBe('vertical_trio');
      expect(groups[2].type).toBe('horizontal_pair');
    });
  });

  describe('packMobileTiles - Landscape Mode', () => {
    it('packs 3 horizontal videos into a 3-cam wide panorama', () => {
      const master = createMockVideo(1, { aspect_ratio: 1.7778 });
      const slave1 = createMockVideo(2, { aspect_ratio: 1.7778 });
      const slave2 = createMockVideo(3, { aspect_ratio: 1.7778 });

      const groups = packMobileTiles(master, [slave1, slave2], true);

      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('horizontal_trio');
      expect(groups[0].gridColsClass).toBe('grid-cols-3');
      expect(groups[0].tiles).toHaveLength(3);
    });
  });
});
