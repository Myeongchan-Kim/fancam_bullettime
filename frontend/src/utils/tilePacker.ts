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
  | 'mixed_v1_h2'
  | 'mixed_v1_h1'
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
    // If we have 3 videos in total (e.g. Master + 2 Slaves) and they are all horizontal:
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

    // Default Landscape: Master on Top, Slaves below
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

    let vIdx = 0;
    let hIdx = 0;
    while (vIdx < verticalSlaves.length) {
      const remaining = verticalSlaves.length - vIdx;
      const remainingHoriz = horizontalSlaves.length - hIdx;
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
      } else if (remainingHoriz >= 2) {
        groups.push({
          id: `mixed-v1-h2-${vIdx}-${hIdx}`,
          type: 'mixed_v1_h2',
          gridColsClass: 'grid-cols-[81fr_128fr]',
          tiles: [verticalSlaves[vIdx], horizontalSlaves[hIdx], horizontalSlaves[hIdx + 1]],
          label: 'MIXED ANGLES (9:16 + 16:9 x 2)',
        });
        vIdx += 1;
        hIdx += 2;
      } else if (remainingHoriz === 1) {
        groups.push({
          id: `mixed-v1-h1-${vIdx}-${hIdx}`,
          type: 'mixed_v1_h1',
          gridColsClass: 'grid-cols-[81fr_256fr]',
          tiles: [verticalSlaves[vIdx], horizontalSlaves[hIdx]],
          label: 'MIXED ANGLES (9:16 + 16:9)',
        });
        vIdx += 1;
        hIdx += 1;
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

    // Group remaining horizontal slaves (2 per row)
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

  // 1. Pack Vertical Slaves: 3 side-by-side (27:16 composite row), 2 side-by-side, or combine 1 vertical with 2 stacked (or 1) horizontal for exact height match
  let vIdx = 0;
  let hIdx = 0;
  while (vIdx < verticalSlaves.length) {
    const remaining = verticalSlaves.length - vIdx;
    const remainingHoriz = horizontalSlaves.length - hIdx;
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
    } else if (remainingHoriz >= 2) {
      // 1 Vertical (9:16, 81fr width => 144fr height) + 2 Stacked Horizontals (16:9 x 2, 128fr width => 72fr*2 = 144fr height)
      groups.push({
        id: `mixed-v1-h2-${vIdx}-${hIdx}`,
        type: 'mixed_v1_h2',
        gridColsClass: 'grid-cols-[81fr_128fr]',
        tiles: [verticalSlaves[vIdx], horizontalSlaves[hIdx], horizontalSlaves[hIdx + 1]],
        label: 'MIXED ANGLES (9:16 + 16:9 x 2)',
      });
      vIdx += 1;
      hIdx += 2;
    } else if (remainingHoriz === 1) {
      // 1 Vertical (9:16, 81fr width => 144fr height) + 1 Horizontal (16:9, 256fr width => 144fr height)
      groups.push({
        id: `mixed-v1-h1-${vIdx}-${hIdx}`,
        type: 'mixed_v1_h1',
        gridColsClass: 'grid-cols-[81fr_256fr]',
        tiles: [verticalSlaves[vIdx], horizontalSlaves[hIdx]],
        label: 'MIXED ANGLES (9:16 + 16:9)',
      });
      vIdx += 1;
      hIdx += 1;
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

  // 2. Pack remaining Horizontal Slaves: 2 side-by-side in a 16:9 split row
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
 * - Mid-spec smartphone (6+ cores, or vertical_trio / mixed_v1_h2 first row on normal devices): 3 live slaves (4 total with Master)
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
    baseCap =
      firstSlaveGroupType === 'vertical_trio' || firstSlaveGroupType === 'mixed_v1_h2'
        ? 3
        : 2;
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
      : firstSlaveGroupType === 'vertical_trio' || firstSlaveGroupType === 'mixed_v1_h2'
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

/**
 * Packs mobile tiles so that all currently playing (LIVE) slave videos are positioned
 * in the top rows immediately below Master, while non-playing (STANDBY) slave videos
 * are pushed down to the bottom rows.
 *
 * When a user taps a standby video, it is promoted into the top live zone (with most-recently
 * selected priority first) and starts playing, while the bumped-out video moves down to standby.
 */
export function packMobileLiveAndStandbyTiles(
  masterVideo: Video | null | undefined,
  slaveVideos: Video[],
  isLandscape: boolean,
  liveSlaveIds: Set<number>,
  manualPriorityIds: number[] = []
): TileLayoutGroup[] {
  const slaveById = new Map<number, Video>();
  for (const v of slaveVideos) {
    slaveById.set(v.id, v);
  }

  const liveSlaves: Video[] = [];
  const addedLiveIds = new Set<number>();

  // 1. Place user's most recently activated live slaves first so promoted standby tiles move to the top
  for (let i = manualPriorityIds.length - 1; i >= 0; i--) {
    const id = manualPriorityIds[i];
    if (liveSlaveIds.has(id) && !addedLiveIds.has(id)) {
      const v = slaveById.get(id);
      if (v) {
        liveSlaves.push(v);
        addedLiveIds.add(id);
      }
    }
  }

  // 2. Append remaining live slaves in natural order
  const standbySlaves: Video[] = [];
  for (const v of slaveVideos) {
    if (liveSlaveIds.has(v.id)) {
      if (!addedLiveIds.has(v.id)) {
        liveSlaves.push(v);
        addedLiveIds.add(v.id);
      }
    } else {
      standbySlaves.push(v);
    }
  }

  const liveGroups = packMobileTiles(masterVideo ?? null, liveSlaves, isLandscape);
  if (standbySlaves.length === 0) {
    return liveGroups;
  }

  const standbyGroups = packMobileTiles(null, standbySlaves, isLandscape).map((g) => ({
    ...g,
    id: `standby-${g.id}`,
    label: g.label ? `${g.label} (STANDBY)` : 'STANDBY ANGLES',
  }));

  return [...liveGroups, ...standbyGroups];
}



