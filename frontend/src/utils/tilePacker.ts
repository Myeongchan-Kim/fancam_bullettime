import { Video } from '../types';

export interface VideoTile {
  video: Video;
  isMaster: boolean;
  aspectRatio: number;
  isVertical: boolean;
}

export type TileGroupType =
  | 'master'
  | 'vertical_trio'
  | 'vertical_pair'
  | 'vertical_single'
  | 'horizontal_pair'
  | 'horizontal_single'
  | 'horizontal_trio';

export interface TileLayoutGroup {
  id: string;
  type: TileGroupType;
  gridColsClass: string;
  tiles: VideoTile[];
  label?: string;
}

export function isVerticalVideo(video: Video): boolean {
  if (video.aspect_ratio && video.aspect_ratio > 0) {
    return video.aspect_ratio < 0.9;
  }
  if (video.width && video.height && video.width > 0 && video.height > 0) {
    return video.height > video.width;
  }
  if (video.is_shorts) return true;
  const title = (video.title || '').toLowerCase();
  return title.includes('세로') || title.includes('vertical') || title.includes('shorts');
}

export function getVideoAspectRatio(video: Video): number {
  if (video.aspect_ratio && video.aspect_ratio > 0) {
    return video.aspect_ratio;
  }
  return isVerticalVideo(video) ? 0.5625 : 1.7778; // 9:16 or 16:9
}

export function packMobileTiles(
  masterVideo: Video | null,
  slaveVideos: Video[],
  isLandscape: boolean
): TileLayoutGroup[] {
  const groups: TileLayoutGroup[] = [];

  const masterTile: VideoTile | null = masterVideo
    ? {
        video: masterVideo,
        isMaster: true,
        aspectRatio: getVideoAspectRatio(masterVideo),
        isVertical: isVerticalVideo(masterVideo),
      }
    : null;

  const slaveTiles: VideoTile[] = slaveVideos.map((v) => ({
    video: v,
    isMaster: false,
    aspectRatio: getVideoAspectRatio(v),
    isVertical: isVerticalVideo(v),
  }));

  // Scenario: Mobile Landscape (Wide and Short)
  if (isLandscape) {
    // If we have 3 videos in total (e.g. Master + 2 Slaves) and they are all horizontal or mixed:
    if (masterTile && slaveTiles.length === 2 && !masterTile.isVertical && !slaveTiles.some(t => t.isVertical)) {
      groups.push({
        id: 'landscape-trio-all',
        type: 'horizontal_trio',
        gridColsClass: 'grid-cols-3',
        tiles: [masterTile, ...slaveTiles],
        label: 'WIDE PANORAMA (3 CAM)',
      });
      return groups;
    }

    // Default Landscape: Master on Left (or standalone), Slaves on Right
    if (masterTile) {
      groups.push({
        id: 'master-landscape',
        type: 'master',
        gridColsClass: 'grid-cols-1',
        tiles: [masterTile],
        label: 'MASTER',
      });
    }

    // Slaves in landscape
    const verticalSlaves = slaveTiles.filter((t) => t.isVertical);
    const horizontalSlaves = slaveTiles.filter((t) => !t.isVertical);

    // Group vertical slaves (3 per row or 2 per row)
    let vIdx = 0;
    while (vIdx < verticalSlaves.length) {
      const remaining = verticalSlaves.length - vIdx;
      if (remaining >= 3) {
        groups.push({
          id: `v-trio-${vIdx}`,
          type: 'vertical_trio',
          gridColsClass: 'grid-cols-3',
          tiles: verticalSlaves.slice(vIdx, vIdx + 3),
          label: 'VERTICAL ANGLES',
        });
        vIdx += 3;
      } else if (remaining === 2) {
        groups.push({
          id: `v-pair-${vIdx}`,
          type: 'vertical_pair',
          gridColsClass: 'grid-cols-2',
          tiles: verticalSlaves.slice(vIdx, vIdx + 2),
          label: 'VERTICAL ANGLES',
        });
        vIdx += 2;
      } else {
        groups.push({
          id: `v-single-${vIdx}`,
          type: 'vertical_single',
          gridColsClass: 'grid-cols-1',
          tiles: [verticalSlaves[vIdx]],
          label: 'VERTICAL ANGLE',
        });
        vIdx += 1;
      }
    }

    // Group horizontal slaves (2 per row)
    let hIdx = 0;
    while (hIdx < horizontalSlaves.length) {
      const remaining = horizontalSlaves.length - hIdx;
      if (remaining >= 2) {
        groups.push({
          id: `h-pair-${hIdx}`,
          type: 'horizontal_pair',
          gridColsClass: 'grid-cols-2',
          tiles: horizontalSlaves.slice(hIdx, hIdx + 2),
          label: 'SIDE ANGLES',
        });
        hIdx += 2;
      } else {
        groups.push({
          id: `h-single-${hIdx}`,
          type: 'horizontal_single',
          gridColsClass: 'grid-cols-1',
          tiles: [horizontalSlaves[hIdx]],
          label: 'SIDE ANGLE',
        });
        hIdx += 1;
      }
    }

    return groups;
  }

  // Scenario: Mobile Portrait (Tall and Narrow)
  if (masterTile) {
    groups.push({
      id: 'master-portrait',
      type: 'master',
      gridColsClass: 'grid-cols-1',
      tiles: [masterTile],
      label: 'MASTER',
    });
  }

  const verticalSlaves = slaveTiles.filter((t) => t.isVertical);
  const horizontalSlaves = slaveTiles.filter((t) => !t.isVertical);

  // 1. Pack Vertical Slaves: 3 side-by-side (27:16 composite row), then 2 side-by-side, then 1
  let vIdx = 0;
  while (vIdx < verticalSlaves.length) {
    const remaining = verticalSlaves.length - vIdx;
    if (remaining >= 3) {
      groups.push({
        id: `v-trio-${vIdx}`,
        type: 'vertical_trio',
        gridColsClass: 'grid-cols-3',
        tiles: verticalSlaves.slice(vIdx, vIdx + 3),
        label: 'VERTICAL CAM TRIO (9:16 x 3)',
      });
      vIdx += 3;
    } else if (remaining === 2) {
      groups.push({
        id: `v-pair-${vIdx}`,
        type: 'vertical_pair',
        gridColsClass: 'grid-cols-2',
        tiles: verticalSlaves.slice(vIdx, vIdx + 2),
        label: 'VERTICAL CAM DUO',
      });
      vIdx += 2;
    } else {
      groups.push({
        id: `v-single-${vIdx}`,
        type: 'vertical_single',
        gridColsClass: 'grid-cols-1',
        tiles: [verticalSlaves[vIdx]],
        label: 'VERTICAL CAM',
      });
      vIdx += 1;
    }
  }

  // 2. Pack Horizontal Slaves: 2 side-by-side in a 16:9 split row
  let hIdx = 0;
  while (hIdx < horizontalSlaves.length) {
    const remaining = horizontalSlaves.length - hIdx;
    if (remaining >= 2) {
      groups.push({
        id: `h-pair-${hIdx}`,
        type: 'horizontal_pair',
        gridColsClass: 'grid-cols-2',
        tiles: horizontalSlaves.slice(hIdx, hIdx + 2),
        label: 'SIDE ANGLES',
      });
      hIdx += 2;
    } else {
      groups.push({
        id: `h-single-${hIdx}`,
        type: 'horizontal_single',
        gridColsClass: 'grid-cols-1',
        tiles: [horizontalSlaves[hIdx]],
        label: 'SIDE ANGLE',
      });
      hIdx += 1;
    }
  }

  return groups;
}
