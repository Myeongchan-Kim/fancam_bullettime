import { useMemo } from 'react';
import { SyncGraphData, SyncGraphVideoNode } from '../types';

export type SyncStatusFilter = 'all' | 'uncalibrated' | 'ai' | 'verified' | 'segmented' | 'solos';

interface UseSyncGraphLanesOptions {
  graphData: SyncGraphData | null;
  statusFilter: SyncStatusFilter;
  searchQuery: string;
  scaleFactor: number;
  laneWidth?: number;
  laneGap?: number;
  timeAxisWidth?: number;
}

export function useSyncGraphLanes({
  graphData,
  statusFilter,
  searchQuery,
  scaleFactor,
  laneWidth = 13,
  laneGap = 5,
  timeAxisWidth = 88,
}: UseSyncGraphLanesOptions) {
  const { minMasterTime, maxMasterTime, totalDuration, timelineSpan } = useMemo(() => {
    if (!graphData || !graphData.videos || graphData.videos.length === 0) {
      return { minMasterTime: 0, maxMasterTime: 10800, totalDuration: 10800, timelineSpan: 10800 };
    }

    const minVideoStart = Math.min(
      0,
      ...graphData.videos.map((v) => {
        if (v.segments && v.segments.length > 0) {
          return Math.min(...v.segments.map((s) => s.master_start));
        }
        return v.master_start_time ?? 0;
      })
    );

    const maxVideoEnd = Math.max(
      graphData.master_video?.duration || 0,
      ...graphData.videos.map((v) => {
        if (v.segments && v.segments.length > 0) {
          return Math.max(...v.segments.map((s) => s.master_end));
        }
        return v.master_end_time ?? 0;
      }),
      7200
    );

    const calculatedMin = minVideoStart < 0 ? Math.floor((minVideoStart - 120) / 60) * 60 : -180;
    const calculatedMax = Math.ceil((maxVideoEnd + 180) / 60) * 60;
    const span = calculatedMax - calculatedMin;

    return {
      minMasterTime: calculatedMin,
      maxMasterTime: calculatedMax,
      totalDuration: maxVideoEnd,
      timelineSpan: span,
    };
  }, [graphData]);

  const canvasHeight = useMemo(() => {
    return Math.max(700, Math.round((timelineSpan / 60) * scaleFactor));
  }, [timelineSpan, scaleFactor]);

  const stats = useMemo(() => {
    if (!graphData || !graphData.videos) {
      return { total: 0, uncalibrated: 0, ai: 0, verified: 0, segmented: 0, solos: 0 };
    }
    const videos = graphData.videos;
    return {
      total: videos.length,
      uncalibrated: videos.filter(
        (v) => !v.is_master && ((v.calibration_count || 0) === 0 || v.status === 'uncalibrated')
      ).length,
      ai: videos.filter((v) => v.status === 'ai_calibrated').length,
      verified: videos.filter((v) => (v.calibration_count || 0) > 0 && v.status !== 'uncalibrated').length,
      segmented: videos.filter((v) => v.segments && v.segments.length > 0).length,
      solos: videos.filter((v) => v.songs && v.songs.some((s) => s.is_solo)).length,
    };
  }, [graphData]);

  const { lanes, allVisibleVideos, videoLaneMap } = useMemo(() => {
    if (!graphData || !graphData.videos) {
      return { lanes: [] as SyncGraphVideoNode[][], allVisibleVideos: [] as SyncGraphVideoNode[], videoLaneMap: new Map<number, number>() };
    }

    const visible = graphData.videos.filter((v) => {
      if (statusFilter === 'uncalibrated') {
        if (v.is_master || ((v.calibration_count || 0) > 0 && v.status !== 'uncalibrated')) return false;
      } else if (statusFilter === 'ai') {
        if (v.status !== 'ai_calibrated') return false;
      } else if (statusFilter === 'verified') {
        if (v.is_master || (v.calibration_count || 0) === 0 || v.status === 'uncalibrated') return false;
      } else if (statusFilter === 'segmented') {
        if (!v.segments || v.segments.length === 0) return false;
      } else if (statusFilter === 'solos') {
        if (!v.songs || !v.songs.some((s) => s.is_solo)) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(query);
        const matchId = v.id.toString() === query.replace('#', '');
        const matchSong = v.songs && v.songs.some((s) => s.name.toLowerCase().includes(query));
        const matchTag = v.members && v.members.some((m) => m.toLowerCase().includes(query));
        if (!matchTitle && !matchId && !matchSong && !matchTag) return false;
      }

      return true;
    });

    const masterVideos = visible.filter((v) => v.is_master);
    const nonMasterVideos = visible.filter((v) => !v.is_master);

    nonMasterVideos.sort((a, b) => {
      const aStart = a.segments && a.segments.length > 0 ? a.segments[0].master_start : a.master_start_time;
      const bStart = b.segments && b.segments.length > 0 ? b.segments[0].master_start : b.master_start_time;
      return aStart - bStart;
    });

    const packedLanes: { items: SyncGraphVideoNode[]; lastEndTime: number }[] = [];
    const laneMap = new Map<number, number>();

    if (masterVideos.length > 0) {
      packedLanes.push({
        items: masterVideos,
        lastEndTime: Math.max(...masterVideos.map((m) => m.master_end_time)),
      });
      masterVideos.forEach((m) => laneMap.set(m.id, 0));
    }

    const MIN_INTERVAL_GAP = 5;

    nonMasterVideos.forEach((cam) => {
      const camStart = cam.segments && cam.segments.length > 0 ? cam.segments[0].master_start : cam.master_start_time;
      const camEnd =
        cam.segments && cam.segments.length > 0
          ? Math.max(...cam.segments.map((s) => s.master_end))
          : cam.master_end_time;

      const startIndex = masterVideos.length > 0 ? 1 : 0;
      let placed = false;

      for (let i = startIndex; i < packedLanes.length; i++) {
        if (camStart >= packedLanes[i].lastEndTime + MIN_INTERVAL_GAP) {
          packedLanes[i].items.push(cam);
          packedLanes[i].lastEndTime = Math.max(packedLanes[i].lastEndTime, camEnd);
          laneMap.set(cam.id, i);
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newLaneIdx = packedLanes.length;
        packedLanes.push({
          items: [cam],
          lastEndTime: camEnd,
        });
        laneMap.set(cam.id, newLaneIdx);
      }
    });

    return {
      lanes: packedLanes.map((l) => l.items),
      allVisibleVideos: visible,
      videoLaneMap: laneMap,
    };
  }, [graphData, statusFilter, searchQuery, totalDuration]);

  const totalCanvasWidth = useMemo(() => {
    return timeAxisWidth + 16 + lanes.length * (laneWidth + laneGap);
  }, [lanes.length, timeAxisWidth, laneWidth, laneGap]);

  return {
    minMasterTime,
    maxMasterTime,
    totalDuration,
    timelineSpan,
    canvasHeight,
    stats,
    lanes,
    allVisibleVideos,
    videoLaneMap,
    totalCanvasWidth,
  };
}
