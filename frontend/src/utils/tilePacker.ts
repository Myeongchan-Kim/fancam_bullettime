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

export interface MobileDeviceProfile {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  screenWidth?: number;
  stallPenalty?: number;
}

/**
 * Computes an adaptive concurrent slave stream budget for mobile/tablet devices.
 *
 * - High-spec mobile/tablet (8+ cores & >=6GB RAM, or tablet screen >=768px with 6+ cores): up to 4 live slaves (5 total with Master)
 * - Mid-spec smartphone (6+ cores, or vertical_trio first row on normal devices): 3 live slaves (4 total with Master)
 * - Low-spec smartphone (<=4 cores or <=4GB RAM): 2 live slaves (3 total with Master)
 * - Dynamically steps down by `stallPenalty` (minimum 1 live slave) when runtime buffering stalls are detected.
 */
export function getAdaptiveMobileSlaveCap(
  groups: TileLayoutGroup[],
  profile?: MobileDeviceProfile
): number {
  let firstSlaveGroupType: TileGroupType | null = null;
  for (const group of groups) {
    if (group.type !== 'master' && firstSlaveGroupType === null) {
      firstSlaveGroupType = group.type;
      break;
    }
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const cores = profile?.hardwareConcurrency ?? nav.hardwareConcurrency ?? 6;
  const memory = profile?.deviceMemory ?? nav.deviceMemory;
  const width =
    profile?.screenWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 390);
  const stallPenalty = Math.max(0, profile?.stallPenalty ?? 0);

  let baseCap: number;
  const isLowSpec = cores <= 4 || (memory !== undefined && memory <= 4);
  const isHighSpec =
    !isLowSpec &&
    ((cores >= 8 && (memory === undefined || memory >= 6)) || (width >= 768 && cores >= 6));

  if (isLowSpec) {
    baseCap = 2;
  } else if (isHighSpec) {
    baseCap = 4;
  } else {
    baseCap = firstSlaveGroupType === 'vertical_trio' ? 3 : 2;
  }

  return Math.max(1, baseCap - stallPenalty);
}

/**
 * Determines which slave video IDs should be mounted as live <YouTube> iframes on mobile devices.
 *
 * Mobile chipsets (iOS WebKit / Android Chrome) restrict hardware-accelerated video decoding to
 * a finite number of concurrent streams. Mounting more iframes than the device can decode causes
 * later videos to fall back to software decoding and enter an infinite seek-buffer spinner loop.
 *
 * When a user explicitly activates a standby tile (`manualPriorityIds`), swaps it into
 * the live budget using most-recently-requested priority without exceeding the cap.
 */
export function getMobileLiveSlaveIds(
  groups: TileLayoutGroup[],
  manualPriorityIds: number[] = [],
  customCap?: number
): Set<number> {
  const orderedSlaveIds: number[] = [];
  let firstSlaveGroupType: TileGroupType | null = null;

  for (const group of groups) {
    if (group.type !== 'master' && firstSlaveGroupType === null) {
      firstSlaveGroupType = group.type;
    }
    for (const tile of group.tiles) {
      if (!tile.isMaster) {
        orderedSlaveIds.push(tile.video.id);
      }
    }
  }

  const maxLiveSlaves =
    customCap !== undefined
      ? customCap
      : firstSlaveGroupType === 'vertical_trio'
      ? 3
      : 2;

  const validSlaveSet = new Set(orderedSlaveIds);
  const liveIds = new Set<number>();

  // 1. Honor user's most recently requested live tiles first (up to cap)
  for (let i = manualPriorityIds.length - 1; i >= 0; i--) {
    const id = manualPriorityIds[i];
    if (validSlaveSet.has(id) && liveIds.size < maxLiveSlaves) {
      liveIds.add(id);
    }
  }

  // 2. Fill remaining budget from top-to-bottom natural layout order
  for (const id of orderedSlaveIds) {
    if (liveIds.size >= maxLiveSlaves) break;
    liveIds.add(id);
  }

  return liveIds;
}


