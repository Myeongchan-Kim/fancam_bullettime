import React from 'react';
import { Sparkles } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';

interface TimelineLanesCanvasProps {
  timelineRef: React.RefObject<HTMLDivElement | null>;
  canvasHeight: number;
  totalCanvasWidth: number;
  totalDuration: number;
  TIME_AXIS_WIDTH: number;
  LANE_WIDTH: number;
  LANE_GAP: number;
  lanes: SyncGraphVideoNode[][];
  allVisibleVideos: SyncGraphVideoNode[];
  videoLaneMap: Map<number, number>;
  selectedTimeCursor: number;
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode | null;
  hoveredVideo: SyncGraphVideoNode | null;
  onTimelineMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSelectVideo: (video: SyncGraphVideoNode, preferredSeekTime?: number) => void;
  onHoverVideo: (video: SyncGraphVideoNode | null) => void;
  formatTime: (sec: number) => string;
}

export const TimelineLanesCanvas: React.FC<TimelineLanesCanvasProps> = ({
  timelineRef,
  canvasHeight,
  totalCanvasWidth,
  totalDuration,
  TIME_AXIS_WIDTH,
  LANE_WIDTH,
  LANE_GAP,
  lanes,
  allVisibleVideos,
  videoLaneMap,
  selectedTimeCursor,
  videoA,
  videoB,
  hoveredVideo,
  onTimelineMouseDown,
  onSelectVideo,
  onHoverVideo,
  formatTime
}) => {
  const getPositionStyles = (startTime: number, duration: number) => {
    const top = (startTime / totalDuration) * canvasHeight;
    const height = Math.max(14, (duration / totalDuration) * canvasHeight);
    return { top: `${top}px`, height: `${height}px` };
  };

  const getLaneX = (laneIdx: number) => {
    return TIME_AXIS_WIDTH + 8 + laneIdx * (LANE_WIDTH + LANE_GAP);
  };

  return (
    <div className="lg:col-span-4 xl:col-span-3 bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-4 pb-6 shadow-2xl backdrop-blur-md overflow-x-auto overflow-y-hidden">
      {/* Unified Track Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs font-mono sticky top-0 bg-slate-900/95 z-20 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="w-12 text-gray-500 font-bold text-[10px]">시간</span>
          <span className="text-purple-400 font-bold flex items-center gap-1 text-[11px]">
            <Sparkles className="w-3 h-3" /> 타임라인 ({lanes.length}T)
          </span>
        </div>
        <span className="text-gray-500 text-[9px] font-mono">{allVisibleVideos.length}개</span>
      </div>

      {/* Continuous Vertical Canvas Container with SVG Background Sync Connection Lines */}
      <div 
        ref={timelineRef}
        onMouseDown={onTimelineMouseDown}
        style={{ height: `${canvasHeight}px`, width: `${totalCanvasWidth}px` }} 
        className="relative mt-3 mb-2 flex cursor-crosshair select-none"
      >
        {/* 1. Left Time Scale Axis (Every 15 minutes) */}
        <div 
          style={{ width: `${TIME_AXIS_WIDTH}px` }}
          className="relative h-full flex-shrink-0 border-r border-slate-800/80"
        >
          {Array.from({ length: Math.ceil(totalDuration / 900) }).map((_, gIdx) => {
            const sec = gIdx * 900;
            const topPx = (sec / totalDuration) * canvasHeight;
            return (
              <div
                key={gIdx}
                style={{ top: `${topPx}px` }}
                className="absolute left-0 right-0 border-t border-slate-800 flex items-center pointer-events-none"
              >
                <span className="text-[9px] font-mono text-gray-500 -mt-2">
                  {formatTime(sec)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 2. Background SVG for Locked Group Sync Tree Connection Lines */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          style={{ height: `${canvasHeight}px` }}
        >
          {lanes.flatMap((laneVideos, lIdx) => {
            const targetLaneIdx = lIdx;
            const targetX = getLaneX(targetLaneIdx) + LANE_WIDTH / 2;

            return laneVideos.flatMap((v) => {
              const isHovered = hoveredVideo?.id === v.id;
              const isSelectedA = videoA?.id === v.id;
              const isSelectedB = videoB?.id === v.id;
              const isChildOrParentActive = 
                (v.parent_video_id && (videoA?.id === v.parent_video_id || videoB?.id === v.parent_video_id || hoveredVideo?.id === v.parent_video_id)) ||
                (hoveredVideo?.parent_video_id === v.id || videoA?.parent_video_id === v.id || videoB?.parent_video_id === v.id);
              const isHighlighted = isHovered || isSelectedA || isSelectedB || isChildOrParentActive;

              const parentId = v.parent_video_id;
              const parentNode = parentId ? allVisibleVideos.find(p => p.id === parentId) : null;
              const parentLaneIdx = parentId ? videoLaneMap.get(parentId) : undefined;
              
              const sourceX = parentLaneIdx !== undefined ? (getLaneX(parentLaneIdx) + LANE_WIDTH / 2) : (getLaneX(0) + LANE_WIDTH / 2);

              if (parentLaneIdx === targetLaneIdx && parentNode && Math.abs(parentNode.master_start_time - v.master_start_time) < 1) {
                return null;
              }

              if (v.is_master && !parentId) return null;

              if (v.segments && v.segments.length > 0) {
                return v.segments.map((seg, sIdx) => {
                  const y = (seg.master_start / totalDuration) * canvasHeight;
                  return (
                    <line
                      key={`sync-seg-${v.id}-${sIdx}`}
                      x1={sourceX}
                      y1={y}
                      x2={targetX}
                      y2={y}
                      stroke={isHighlighted ? '#ff5e99' : parentId ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.18)'}
                      strokeWidth={isHighlighted ? 2.2 : parentId ? 1.5 : 1}
                      strokeDasharray={isHighlighted ? 'none' : parentId ? '4 2' : '2 3'}
                      className="transition-all duration-150"
                    />
                  );
                });
              }

              const y = (v.master_start_time / totalDuration) * canvasHeight;
              return (
                <line
                  key={`sync-${v.id}`}
                  x1={sourceX}
                  y1={y}
                  x2={targetX}
                  y2={y}
                  stroke={isHighlighted ? '#ff5e99' : parentId ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.18)'}
                  strokeWidth={isHighlighted ? 2.2 : parentId ? 1.5 : 1}
                  strokeDasharray={isHighlighted ? 'none' : parentId ? '4 2' : '2 3'}
                  className="transition-all duration-150"
                />
              );
            });
          })}
        </svg>

        {/* 3. Unified Parallel Lanes System */}
        <div className="relative h-full flex items-start pl-2 gap-[6px] z-10">
          {lanes.map((laneVideos, lIdx) => {
            const isMasterLane = lIdx === 0 && laneVideos.some(v => v.is_master);

            return (
              <div
                key={lIdx}
                style={{ width: `${LANE_WIDTH}px` }}
                className="relative h-full flex flex-col items-center flex-shrink-0 group"
              >
                {/* Lane Header Label */}
                <div className="text-[8px] font-mono font-bold text-gray-500 truncate w-full text-center mb-1 pointer-events-none">
                  {isMasterLane ? '🏆' : `T${lIdx}`}
                </div>

                {/* Lane Background Vertical Rail Guide */}
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-slate-800/40 pointer-events-none" />

                {/* Stacked Thin Bars in this Lane */}
                {laneVideos.map((cam) => {
                  const isDeckA = videoA?.id === cam.id;
                  const isDeckB = videoB?.id === cam.id;
                  const isHovered = hoveredVideo?.id === cam.id;
                  const isMaster = cam.is_master;
                  const isUncalibrated = !isMaster && ((cam.calibration_count || 0) === 0 || cam.status === 'uncalibrated');
                  const isAI = cam.status === 'ai_calibrated';
                  const isDrift = cam.status === 'drift_warning';
                  const hasSegments = cam.segments && cam.segments.length > 0;

                  if (hasSegments) {
                    return cam.segments.map((seg, sIdx) => {
                      const segDur = seg.video_end - seg.video_start;
                      const pos = getPositionStyles(seg.master_start, segDur);
                      return (
                        <div
                          key={`${cam.id}-seg-${sIdx}`}
                          style={{ top: pos.top, height: pos.height }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectVideo(cam, seg.master_start);
                          }}
                          onMouseEnter={() => onHoverVideo(cam)}
                          onMouseLeave={() => onHoverVideo(null)}
                          className={`absolute inset-x-0 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                            isDeckB
                              ? 'bg-amber-400 border-amber-300 ring-2 ring-twice-magenta shadow-lg shadow-amber-500/50 z-20'
                              : isDeckA
                              ? 'bg-sky-400 border-sky-300 ring-2 ring-sky-400 shadow-lg shadow-sky-500/50 z-20'
                              : isHovered
                              ? 'bg-amber-400 border-amber-300 ring-1 ring-twice-apricot z-15'
                              : 'bg-amber-600/80 border-amber-500/80 hover:bg-amber-500'
                          }`}
                          title={`#${cam.id} (${seg.label || `Part ${sIdx+1}`}) ${cam.title} [${formatTime(seg.master_start)} ~ ${formatTime(seg.master_end)}] - 세그먼트`}
                        >
                          <span className="text-[6px] font-mono font-black text-slate-950 px-0.5 truncate pointer-events-none">
                            {isDeckA ? 'A' : isDeckB ? 'B' : cam.members?.[0]?.slice(0, 2) || `#${cam.id}`}
                          </span>
                        </div>
                      );
                    });
                  }

                  const pos = getPositionStyles(cam.master_start_time, cam.duration);
                  return (
                    <div
                      key={cam.id}
                      style={{ top: pos.top, height: pos.height }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVideo(cam);
                      }}
                      onMouseEnter={() => onHoverVideo(cam)}
                      onMouseLeave={() => onHoverVideo(null)}
                      className={`absolute inset-x-0 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                        isDeckB
                          ? 'bg-twice-magenta border-pink-300 ring-2 ring-twice-magenta shadow-lg shadow-twice-magenta/50 z-20'
                          : isDeckA
                          ? 'bg-sky-400 border-sky-200 ring-2 ring-sky-400 shadow-lg shadow-sky-500/50 z-20'
                          : isMaster
                          ? 'bg-gradient-to-b from-purple-500 to-twice-magenta border-purple-400'
                          : isHovered
                          ? 'bg-twice-magenta/80 border-pink-300 ring-1 ring-twice-apricot z-15'
                          : isUncalibrated
                          ? 'bg-slate-800 border-2 border-dashed border-amber-400/90 text-amber-300 hover:bg-amber-950/80 shadow-sm shadow-amber-950/50'
                          : isAI
                          ? 'bg-emerald-600/70 border-emerald-400 hover:bg-emerald-500'
                          : isDrift
                          ? 'bg-rose-500/80 border-rose-400 hover:bg-rose-400'
                          : cam.duration >= 3600
                          ? 'bg-cyan-500/80 border-cyan-400 hover:bg-cyan-400'
                          : 'bg-pink-600/70 border-pink-500/80 hover:bg-twice-magenta'
                      }`}
                      title={`#${cam.id} ${cam.title} [${formatTime(cam.master_start_time)} ~ ${formatTime(cam.master_end_time)}] - ${
                        isUncalibrated 
                          ? '⚠️ 미보정 영상 (Count: 0)' 
                          : isAI 
                          ? `🤖 AI 자동보정 (${cam.calibration_count || 1}회)` 
                          : `✅ 검증완료 (${cam.calibration_count || 1}회)`
                      }`}
                    >
                      <span className={`font-mono font-black text-white pointer-events-none select-none ${
                        isDeckA || isDeckB || isMaster || isUncalibrated
                          ? 'text-[8px]'
                          : 'text-[7.5px] rotate-90 whitespace-nowrap tracking-tighter'
                      }`}>
                        {isDeckA ? 'A' : isDeckB ? 'B' : isMaster ? 'M' : isUncalibrated ? '⚠️' : `#${cam.id}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 4. Interactive Horizontal Time Scrubber Line */}
        <div
          style={{ top: `${(selectedTimeCursor / totalDuration) * canvasHeight}px` }}
          className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
        >
          <div className="w-full border-t-2 border-twice-magenta shadow-[0_0_12px_rgba(255,94,153,0.8)]" />
          <span className="absolute left-2 -top-3 bg-twice-magenta text-white px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black shadow-lg">
            ⏱️ {formatTime(selectedTimeCursor)}
          </span>
        </div>
      </div>
    </div>
  );
};
