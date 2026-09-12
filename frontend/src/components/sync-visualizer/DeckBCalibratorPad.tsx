import React, { useRef, useState, useEffect } from 'react';
import { Sliders, RotateCcw, GripVertical, Save, ShieldCheck, Compass, Sparkles, Layers, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';
import { getActiveSegment } from '../../utils/syncGraphCalculations';

interface DeckBCalibratorPadProps {
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode;
  fineTuneDelta: number;
  trimStartDelta?: number;
  trimEndDelta?: number;
  selectedTimeCursor: number;
  isSavingOffset: boolean;
  saveSuccessMsg: string | null;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  isLoadingCalibrator: boolean;
  formatTime: (sec: number) => string;
  onResetFineTune: () => void;
  onDeltaChange: (newDelta: number) => void;
  onTrimChange?: (trimStart: number, trimEnd: number) => void;
  onNudge: (amount: number) => void;
  onSaveOffset: () => void;
  onOpenCalibrator: (video: SyncGraphVideoNode, hasSegments: boolean) => void;
  onTriggerRoughSync: (video: SyncGraphVideoNode) => void;
  onTriggerAiSync: (video: SyncGraphVideoNode) => void;
  onSeek?: (masterSec: number) => void;
  onSelectSegment?: (segment: any) => void;
}

export const DeckBCalibratorPad: React.FC<DeckBCalibratorPadProps> = ({
  videoA,
  videoB,
  fineTuneDelta,
  trimStartDelta = 0,
  trimEndDelta = 0,
  selectedTimeCursor,
  isSavingOffset,
  saveSuccessMsg,
  isAiSyncing,
  isRoughSyncing,
  isLoadingCalibrator,
  formatTime,
  onResetFineTune,
  onDeltaChange,
  onTrimChange,
  onNudge,
  onSaveOffset,
  onOpenCalibrator,
  onTriggerRoughSync,
  onTriggerAiSync,
  onSeek,
  onSelectSegment
}) => {
  if (videoB.is_master) return null;

  // Check if Video B has segments and identify the active segment at current cursor
  const isSplitVideo = !!(videoB.segments && videoB.segments.length > 0);
  const activeSegment = isSplitVideo ? getActiveSegment(videoB, selectedTimeCursor) : null;

  // Master timeline coordinates for Deck A
  // Deck A is typically the master video (0 to duration), or another fancam (master_start to master_end)
  const durA = videoA?.duration || 240;
  const startA = videoA 
    ? (videoA.master_start_time !== undefined && videoA.master_start_time !== null 
        ? videoA.master_start_time 
        : (videoA.sync_offset || 0))
    : 0;
  const endA = videoA
    ? (videoA.master_end_time !== undefined && videoA.master_end_time !== null
        ? videoA.master_end_time
        : startA + durA)
    : startA + durA;

  // The effective offset being calibrated
  const baseOffset = activeSegment ? activeSegment.sync_offset : (videoB.sync_offset || 0);
  const currentEffectiveOffset = Number((baseOffset + fineTuneDelta).toFixed(2));

  // Video coordinates with trim (늘리고 줄이기: 시작/끝 조정)
  const baseVideoStartB = activeSegment ? activeSegment.video_start : 0;
  const baseVideoEndB = activeSegment ? activeSegment.video_end : (videoB.duration || 240);

  const currentVideoStartB = Math.max(0, baseVideoStartB + trimStartDelta);
  const currentVideoEndB = Math.max(currentVideoStartB + 0.5, baseVideoEndB + trimEndDelta);
  const durB = currentVideoEndB - currentVideoStartB;

  // Current active Deck B segment's live master start position (shifted by fineTuneDelta & trim)
  const currentMasterStartB = currentVideoStartB + currentEffectiveOffset;
  const currentMasterEndB = currentVideoEndB + currentEffectiveOffset;

  // Viewport window offset shift (allows scrolling the comparison window by ±5 minutes)
  const [viewportShift, setViewportShift] = useState<number>(0);

  // When switching segments, automatically re-center the viewport to that segment
  useEffect(() => {
    setViewportShift(0);
  }, [activeSegment?.id]);

  // Timeline view window: Deck B active bar length + margin of ±5 minutes (300s left, 300s right)
  const MARGIN_SECONDS = 300; // 5 minutes
  const timelineSpan = durB + MARGIN_SECONDS * 2; // Total width = bar length + 10 minutes

  // The base reference position for the window is the saved base master start + viewportShift.
  // CRITICAL: We DO NOT add fineTuneDelta to the window anchor!
  // This keeps the track background completely fixed while the active bar itself moves smoothly inside it when dragged.
  const baseMasterStartB = activeSegment 
    ? activeSegment.master_start 
    : (videoB.master_start_time !== undefined && videoB.master_start_time !== null 
        ? videoB.master_start_time 
        : (videoB.sync_offset || 0));
  const windowAnchor = baseMasterStartB + viewportShift;
  const timelineMin = windowAnchor - MARGIN_SECONDS;
  const timelineMax = timelineMin + timelineSpan;

  // Pointer drag & resize state & ref
  type DragMode = 'move' | 'resize-left' | 'resize-right';
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startDelta: number;
    startTrimStart: number;
    startTrimEnd: number;
    trackWidth: number;
  } | null>(null);

  const handleBarPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    mode: DragMode
  ) => {
    if (!trackContainerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = trackContainerRef.current.getBoundingClientRect();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startDelta: fineTuneDelta,
      startTrimStart: trimStartDelta,
      startTrimEnd: trimEndDelta,
      trackWidth: Math.max(rect.width, 1)
    };
    setIsDragging(true);
    setDragMode(mode);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragRef.current) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaTime = (deltaX / dragRef.current.trackWidth) * timelineSpan;

    if (dragRef.current.mode === 'move') {
      const newDelta = Math.round((dragRef.current.startDelta + deltaTime) * 20) / 20; // 0.05s snap step
      onDeltaChange(Number(newDelta.toFixed(2)));
    } else if (dragRef.current.mode === 'resize-left') {
      const newTrimStart = Math.round((dragRef.current.startTrimStart + deltaTime) * 20) / 20;
      onTrimChange?.(Number(newTrimStart.toFixed(2)), trimEndDelta);
    } else if (dragRef.current.mode === 'resize-right') {
      const newTrimEnd = Math.round((dragRef.current.startTrimEnd + deltaTime) * 20) / 20;
      onTrimChange?.(trimStartDelta, Number(newTrimEnd.toFixed(2)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      setDragMode(null);
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  // Clicking on track container empty background (outside of any bar) seeks to clicked position
  const handleTrackBackgroundPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && onSeek) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickPct = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = timelineMin + clickPct * timelineSpan;
      onSeek(targetTime);
    }
  };

  // Pointer Seeking on Deck A Reference Track
  const seekFromPointerA = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = timelineMin + clickPct * timelineSpan;
    onSeek(targetTime);
  };

  const handleTrackAPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
    seekFromPointerA(e);
  };

  const handleTrackAPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1 && onSeek) {
      seekFromPointerA(e);
    }
  };

  // Current playback position vertical cursor in calibrator window
  const cursorPct = ((selectedTimeCursor - timelineMin) / timelineSpan) * 100;
  const isCursorVisible = cursorPct >= 0 && cursorPct <= 100;

  return (
    <div className="bg-slate-900/95 border border-twice-magenta/40 rounded-2xl p-4 shadow-xl space-y-3 backdrop-blur-sm ring-1 ring-twice-magenta/20">
      {/* Calibrator Header & Offset / Delta Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-twice-magenta/20 text-twice-magenta flex items-center justify-center text-[10px] font-mono font-black border border-twice-magenta/40">
            B
          </span>
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-twice-magenta" />
            <span className="text-xs font-black text-gray-200 uppercase tracking-wide">
              Deck B 싱크 캘리브레이터
            </span>
            <span className="text-xs text-twice-magenta font-mono font-bold truncate max-w-[220px]">
              (#{videoB.id} {videoB.title})
            </span>
            {activeSegment && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  <Scissors className="w-2.5 h-2.5" />
                  선택 구간: {activeSegment.label || `#${activeSegment.id}`}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ({formatTime(activeSegment.video_start)} ~ {formatTime(activeSegment.video_end)})
                </span>
                {activeSegment.members && activeSegment.members.length > 0 && (
                  <div className="flex items-center gap-1">
                    {activeSegment.members.map((m: string) => (
                      <span key={m} className="px-1.5 py-0.2 rounded bg-twice-magenta/20 text-twice-apricot border border-twice-magenta/30 text-[9px] font-bold">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono">
          {(fineTuneDelta !== 0 || trimStartDelta !== 0 || trimEndDelta !== 0) && (
            <button
              onClick={onResetFineTune}
              className="text-[10px] font-bold text-gray-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-all flex items-center gap-1 shadow-sm active:scale-95"
              title="원래 오프셋 및 구간 범위로 되돌리기"
            >
              <RotateCcw className="w-2.5 h-2.5" /> 초기화
            </button>
          )}
          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 shadow-inner text-[11px]">
            <span className="text-gray-400">
              Delta: <strong className={fineTuneDelta > 0 ? 'text-emerald-400' : fineTuneDelta < 0 ? 'text-rose-400' : 'text-gray-400'}>
                {fineTuneDelta > 0 ? `+${fineTuneDelta.toFixed(2)}` : fineTuneDelta.toFixed(2)}s
              </strong>
            </span>
            {(trimStartDelta !== 0 || trimEndDelta !== 0) && (
              <>
                <div className="h-3 w-px bg-slate-800" />
                <span className="text-amber-400 font-bold">
                  Trim: [{trimStartDelta > 0 ? `+${trimStartDelta.toFixed(1)}` : trimStartDelta.toFixed(1)}s ~ {trimEndDelta > 0 ? `+${trimEndDelta.toFixed(1)}` : trimEndDelta.toFixed(1)}s]
                </span>
              </>
            )}
            <div className="h-3 w-px bg-slate-800" />
            <span className="font-black text-white">
              Offset: {currentEffectiveOffset.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>

      {/* 2-Row Interactive Timeline Comparison Tracks (Deck A vs Deck B) */}
      <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-2">
        <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
          <span className="flex items-center gap-1.5 text-gray-300 font-bold">
            <Layers className="w-3 h-3 text-twice-apricot" />
            2-Track 타임라인 바 비교 {isSplitVideo && <span className="text-amber-400 font-bold">({videoB.segments.length}개 Split 구간 표시)</span>}
          </span>
          <div className="flex items-center gap-2">
            {isCursorVisible ? (
              <span className="text-[10px] font-bold text-red-400 bg-red-950/70 border border-red-500/40 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                재생: {formatTime(selectedTimeCursor)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setViewportShift(Math.round(selectedTimeCursor - baseMasterStartB))}
                className="text-[10px] font-bold text-red-400/90 hover:text-red-300 bg-red-950/40 hover:bg-red-950/80 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 transition-all"
                title="재생 위치로 타임라인 뷰 이동"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
                재생 위치로 이동 ({formatTime(selectedTimeCursor)})
              </button>
            )}
            <span className="text-[9px] text-gray-500">
              타임라인 윈도우: {formatTime(timelineMin)} ─── {formatTime(timelineMax)}
            </span>
          </div>
        </div>

        {/* Row 1: Deck A Reference Bar (Fixed - Click to Seek) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span className="text-sky-300 font-bold flex items-center gap-1 truncate max-w-[360px]">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              [Deck A 기준] #{videoA?.id || '?'} {videoA?.title || '기준 영상'}
              <span className="text-[9px] text-sky-400/80 font-normal ml-1">· 바 클릭 시 재생 위치 이동</span>
            </span>
            <span className="text-[10px] text-gray-400 shrink-0">
              위치: {formatTime(startA)} ── {formatTime(endA)} ({formatTime(durA)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Spacer matching Row 2 left button */}
            <div className="w-[43px] shrink-0" aria-hidden="true" />

            {/* Deck A Track Container */}
            <div 
              onPointerDown={handleTrackAPointerDown}
              onPointerMove={handleTrackAPointerMove}
              className="flex-1 h-5 bg-slate-900 rounded-lg overflow-hidden relative border border-sky-500/20 hover:border-sky-400/60 hover:ring-1 hover:ring-sky-400/30 cursor-pointer transition-all select-none"
              title="클릭 또는 드래그하여 해당 위치로 재생 이동 (Click/Drag to Seek)"
            >
              {(() => {
                // Deck A bar covers [startA, endA] on master timeline
                // If Deck A is full concert covering the window, it spans smoothly across
                const visibleStart = Math.max(timelineMin, startA);
                const visibleEnd = Math.min(timelineMax, endA);
                if (visibleEnd <= visibleStart) return null;
                const leftPct = Math.max(0, Math.min(100, ((visibleStart - timelineMin) / timelineSpan) * 100));
                const rightPct = Math.max(0, Math.min(100, ((visibleEnd - timelineMin) / timelineSpan) * 100));
                const widthPct = Math.max(0.5, rightPct - leftPct);
                return (
                  <div
                    className="absolute top-0 bottom-0 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-[5px] border-x-2 border-white/60 shadow-sm transition-all flex items-center px-2 pointer-events-none"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`
                    }}
                    title={`Deck A: ${formatTime(startA)} ~ ${formatTime(endA)}`}
                  >
                    <span className="text-[9px] font-bold text-white/90 drop-shadow truncate">
                      {videoA?.title || '기준 영상'}
                    </span>
                  </div>
                );
              })()}

              {/* Playback Position Vertical Needle */}
              {isCursorVisible && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] z-20 pointer-events-none transition-[left] duration-100 ease-linear"
                  style={{ left: `${cursorPct}%` }}
                >
                  <div className="absolute -top-1 -left-[3px] w-2 h-2 bg-red-500 rotate-45 rounded-[1px] shadow-sm" />
                </div>
              )}
            </div>

            {/* Spacer matching Row 2 right button */}
            <div className="w-[43px] shrink-0" aria-hidden="true" />
          </div>
        </div>

        {/* Row 2: Deck B Target Bar with Multiple Segments Support */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span className="text-twice-magenta font-bold flex items-center gap-1 truncate max-w-[340px]">
              <span className="w-2 h-2 rounded-full bg-twice-magenta animate-pulse" />
              [Deck B {activeSegment ? `구간: ${activeSegment.label || `#${activeSegment.id}`}` : '대상'}] #{videoB.id} {videoB.title}
            </span>
            <div className="flex items-center gap-2">
              {viewportShift !== 0 && (
                <button
                  onClick={() => setViewportShift(0)}
                  className="text-[9px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-bold"
                  title="타임라인 뷰를 Deck B 중앙 위치로 리셋"
                >
                  뷰 리셋 ({viewportShift > 0 ? `+${viewportShift / 60}분` : `${viewportShift / 60}분`})
                </button>
              )}
              <span className="text-[10px] text-twice-magenta font-bold shrink-0">
                위치: {formatTime(currentMasterStartB)} ── {formatTime(currentMasterEndB)} (Offset: {currentEffectiveOffset.toFixed(2)}s)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Shift viewport left by 5 minutes (-300s) */}
            <button
              type="button"
              onClick={() => setViewportShift(prev => prev - 300)}
              className="h-8 px-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm active:scale-95 group"
              title="타임라인 구간을 5분 앞으로 이동 (-5분)"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-twice-magenta group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline font-mono text-[9px] mr-0.5">-5m</span>
            </button>

            {/* Draggable Track Container (contains all segments of Deck B) */}
            <div
              ref={trackContainerRef}
              onPointerDown={handleTrackBackgroundPointerDown}
              className={`flex-1 h-8 bg-slate-900 rounded-lg overflow-hidden relative select-none border ${
                isDragging ? 'border-twice-magenta ring-2 ring-twice-magenta/40' : 'border-twice-magenta/30 hover:border-twice-magenta/60'
              } transition-colors cursor-pointer`}
              title="바 위에서 드래그하여 오프셋 조절 / 양끝 드래그로 구간 조절 / 다른 바 클릭 시 해당 구간으로 이동"
            >
              {/* If split video, render all segments in the viewport */}
              {isSplitVideo && videoB.segments ? (
                videoB.segments.map((seg) => {
                  const isActive = activeSegment?.id === seg.id;
                  const segMasterStart = isActive ? currentMasterStartB : seg.master_start;
                  const segMasterEnd = isActive ? currentMasterEndB : seg.master_end;

                  // Check visibility in current timelineMin ~ timelineMax window
                  const visibleStart = Math.max(timelineMin, segMasterStart);
                  const visibleEnd = Math.min(timelineMax, segMasterEnd);
                  if (visibleEnd <= visibleStart) return null;

                  const leftPct = Math.max(0, Math.min(100, ((visibleStart - timelineMin) / timelineSpan) * 100));
                  const rightPct = Math.max(0, Math.min(100, ((visibleEnd - timelineMin) / timelineSpan) * 100));
                  const widthPct = Math.max(1.5, rightPct - leftPct);
                  const isVeryNarrow = widthPct < 5;
                  const isNarrow = widthPct < 10;

                  if (isActive) {
                    return (
                      <div
                        key={seg.id}
                        onPointerDown={(e) => handleBarPointerDown(e, 'move')}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={`absolute top-0 bottom-0 rounded-[5px] border-x-2 border-white flex items-center ${
                          isNarrow ? 'justify-center px-1' : 'justify-between px-1.5'
                        } bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-2 ring-white/60 transition-transform z-10 overflow-hidden cursor-grab active:cursor-grabbing select-none`}
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`
                        }}
                        title={`현재 편집 중인 구간: ${seg.label || `#${seg.id}`} (바 드래그: 오프셋 조절, 양끝 드래그: 구간 조절)`}
                      >
                        {/* Left Resize Handle (늘리고 줄이기: 시작점) */}
                        {widthPct >= 6 && (
                          <div
                            onPointerDown={(e) => handleBarPointerDown(e, 'resize-left')}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-white/20 hover:bg-white/70 active:bg-white cursor-ew-resize z-30 transition-all flex items-center justify-center group"
                            title="구간 시작점 늘리고 줄이기 (좌우 드래그)"
                          >
                            <div className="w-[2px] h-3.5 bg-white/90 group-hover:bg-slate-900 rounded-full" />
                          </div>
                        )}

                        {!isNarrow && <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow ml-1.5 pointer-events-none" />}
                        {!isVeryNarrow && (
                          <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-0.5 uppercase pointer-events-none">
                            {isDragging && dragMode === 'move'
                              ? `Offset: ${currentEffectiveOffset.toFixed(2)}s`
                              : isDragging && dragMode === 'resize-left'
                                ? `시작: ${formatTime(currentMasterStartB)}`
                                : isDragging && dragMode === 'resize-right'
                                  ? `끝: ${formatTime(currentMasterEndB)}`
                                  : isNarrow 
                                    ? `${seg.label || `#${seg.id}`}` 
                                    : `${seg.label || `구간 #${seg.id}`} (드래그 조절)`}
                          </span>
                        )}
                        {isVeryNarrow ? (
                          <GripVertical className="h-3 w-3 text-white/90 shrink-0 drop-shadow pointer-events-none" />
                        ) : !isNarrow ? (
                          <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow mr-1.5 pointer-events-none" />
                        ) : null}

                        {/* Right Resize Handle (늘리고 줄이기: 끝점) */}
                        {widthPct >= 6 && (
                          <div
                            onPointerDown={(e) => handleBarPointerDown(e, 'resize-right')}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-white/20 hover:bg-white/70 active:bg-white cursor-ew-resize z-30 transition-all flex items-center justify-center group"
                            title="구간 끝점 늘리고 줄이기 (좌우 드래그)"
                          >
                            <div className="w-[2px] h-3.5 bg-white/90 group-hover:bg-slate-900 rounded-full" />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Non-active other split segments (styled distinctively to show surrounding segments)
                  return (
                    <div
                      key={seg.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSegment?.(seg);
                        onSeek?.(seg.master_start);
                      }}
                      className="absolute top-0.5 bottom-0.5 rounded-[5px] border-l-2 border-pink-400 flex items-center px-1 bg-pink-900/60 hover:bg-pink-700/90 border-y border-r border-pink-500/40 opacity-75 hover:opacity-100 transition-all z-0 overflow-hidden cursor-pointer hover:ring-1 hover:ring-pink-400 group"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`
                      }}
                      title={`클릭하여 해당 구간으로 이동: ${seg.label || `#${seg.id}`} (${formatTime(segMasterStart)} ~ ${formatTime(segMasterEnd)})`}
                    >
                      <span className="text-[8px] font-bold text-pink-200 group-hover:text-white truncate drop-shadow">
                        {seg.label || `구간 #${seg.id}`}
                      </span>
                    </div>
                  );
                })
              ) : (
                /* Continuous video (single bar) */
                (() => {
                  const leftPct = Math.max(0, Math.min(96, ((currentMasterStartB - timelineMin) / timelineSpan) * 100));
                  const widthPct = Math.max(2, Math.min(100, (durB / timelineSpan) * 100));
                  const isVeryNarrow = widthPct < 5;
                  const isNarrow = widthPct < 10;
                  return (
                    <div
                      onPointerDown={(e) => handleBarPointerDown(e, 'move')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      className={`absolute top-0 bottom-0 rounded-[5px] border-x-2 border-white/80 flex items-center ${
                        isNarrow ? 'justify-center px-1' : 'justify-between px-2'
                      } bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-1 ring-white/30 transition-transform overflow-hidden cursor-grab active:cursor-grabbing select-none`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`
                      }}
                      title="바 드래그: 오프셋 이동, 양끝 드래그: 구간 조절"
                    >
                      {/* Left Resize Handle */}
                      {widthPct >= 6 && (
                        <div
                          onPointerDown={(e) => handleBarPointerDown(e, 'resize-left')}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-white/20 hover:bg-white/70 active:bg-white cursor-ew-resize z-30 transition-all flex items-center justify-center group"
                          title="시작 위치 늘리고 줄이기 (좌우 드래그)"
                        >
                          <div className="w-[2px] h-3.5 bg-white/90 group-hover:bg-slate-900 rounded-full" />
                        </div>
                      )}

                      {!isNarrow && <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow ml-1 pointer-events-none" />}
                      {!isVeryNarrow && (
                        <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-1 uppercase pointer-events-none">
                          {isDragging && dragMode === 'move'
                            ? `Offset: ${currentEffectiveOffset.toFixed(2)}s` 
                            : isDragging && dragMode === 'resize-left'
                              ? `시작: ${formatTime(currentMasterStartB)}`
                              : isDragging && dragMode === 'resize-right'
                                ? `끝: ${formatTime(currentMasterEndB)}`
                                : isNarrow 
                                  ? '드래그 조절' 
                                  : '드래그하여 싱크 조절 (Drag to Sync)'}
                        </span>
                      )}
                      {isVeryNarrow ? (
                        <GripVertical className="h-3 w-3 text-white/90 shrink-0 drop-shadow pointer-events-none" />
                      ) : !isNarrow ? (
                        <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow mr-1 pointer-events-none" />
                      ) : null}

                      {/* Right Resize Handle */}
                      {widthPct >= 6 && (
                        <div
                          onPointerDown={(e) => handleBarPointerDown(e, 'resize-right')}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          className="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3.5 bg-white/20 hover:bg-white/70 active:bg-white cursor-ew-resize z-30 transition-all flex items-center justify-center group"
                          title="끝 위치 늘리고 줄이기 (좌우 드래그)"
                        >
                          <div className="w-[2px] h-3.5 bg-white/90 group-hover:bg-slate-900 rounded-full" />
                        </div>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Playback Position Vertical Needle */}
              {isCursorVisible && (
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)] z-20 pointer-events-none transition-[left] duration-100 ease-linear"
                  style={{ left: `${cursorPct}%` }}
                >
                  <div className="absolute -bottom-1 -left-[3px] w-2 h-2 bg-red-500 rotate-45 rounded-[1px] shadow-sm" />
                </div>
              )}
            </div>

            {/* Shift viewport right by 5 minutes (+300s) */}
            <button
              type="button"
              onClick={() => setViewportShift(prev => prev + 300)}
              className="h-8 px-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm active:scale-95 group"
              title="타임라인 구간을 5분 뒤로 이동 (+5분)"
            >
              <span className="hidden sm:inline font-mono text-[9px] ml-0.5">+5m</span>
              <ChevronRight className="w-3.5 h-3.5 text-twice-magenta group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Step Nudge Buttons Grid (0.05s, 0.1s, 0.5s, 1.0s) */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 font-mono text-[11px]">
        <button 
          onClick={() => onNudge(-1.0)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          -1.0s
        </button>
        <button 
          onClick={() => onNudge(-0.5)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          -0.50s
        </button>
        <button 
          onClick={() => onNudge(-0.1)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          -0.10s
        </button>
        <button 
          onClick={() => onNudge(-0.05)} 
          className="py-1.5 bg-slate-800/90 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/40 font-black rounded-lg transition-all active:scale-95 shadow-sm"
        >
          -0.05s
        </button>
        <button 
          onClick={() => onNudge(+0.05)} 
          className="py-1.5 bg-slate-800/90 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/40 font-black rounded-lg transition-all active:scale-95 shadow-sm"
        >
          +0.05s
        </button>
        <button 
          onClick={() => onNudge(+0.1)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          +0.10s
        </button>
        <button 
          onClick={() => onNudge(+0.5)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          +0.50s
        </button>
        <button 
          onClick={() => onNudge(+1.0)} 
          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
        >
          +1.0s
        </button>
      </div>

      {/* Keyboard shortcuts hints & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5 flex-wrap">
          <span>💡 단축키:</span>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">←</kbd>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">→</kbd> (5초 재생 이동)
          <span className="text-gray-600">│</span>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded text-[9px]">Shift</kbd> + 방향키 (0.1s 오프셋)
          <span className="text-gray-600">│</span>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded text-[9px]">Space</kbd> (동시 재생/정지)
          <span className="text-gray-600">│</span>
          <span className="text-twice-magenta">바 드래그: 오프셋 이동</span>
          <span className="text-gray-600">│</span>
          <span className="text-amber-400">양끝 핸들: 구간 조절</span>
          <span className="text-gray-600">│</span>
          <span className="text-pink-300">다른 바 클릭: 구간 이동</span>
        </div>

        <div className="flex items-center gap-2">
          {(fineTuneDelta !== 0 || trimStartDelta !== 0 || trimEndDelta !== 0) && (
            <button
              onClick={onSaveOffset}
              disabled={isSavingOffset}
              className={`px-3 py-1.5 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg text-xs transition-all ${
                isSavingOffset 
                  ? 'bg-emerald-700 cursor-wait shadow-emerald-950/50' 
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950 hover:scale-105 active:scale-95'
              }`}
            >
              {isSavingOffset ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>저장 처리 중...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>{activeSegment ? `구간 [${activeSegment.label || `#${activeSegment.id}`}] 저장` : '오프셋 영구 저장'}</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={() => onOpenCalibrator(videoB, !!(videoB.segments && videoB.segments.length > 0))}
            disabled={isLoadingCalibrator}
            className="px-3 py-1.5 bg-twice-magenta/20 hover:bg-twice-magenta/30 text-twice-magenta rounded-xl border border-twice-magenta/40 flex items-center gap-1.5 font-bold text-xs transition-all disabled:opacity-50"
            title="구간 SPLIT 캘리브레이터 열기"
          >
            <ShieldCheck className="w-3.5 h-3.5" /> 구간 SPLIT 캘리브레이터
          </button>
          <button
            onClick={() => onTriggerRoughSync(videoB)}
            disabled={isAiSyncing || isRoughSyncing}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-amber-950/50 text-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            title="영상 설명란 타임스탬프 및 세트리스트 기반 대략적 위치(Macro Offset) 즉시 안착"
          >
            <Compass className="w-3.5 h-3.5 animate-spin-slow" /> 🎯 대략적 위치 찾기
          </button>
          <button
            onClick={() => onTriggerAiSync(videoB)}
            disabled={isAiSyncing || isRoughSyncing}
            className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 text-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            title="Gemini Vision 화면 분석 + 3-Point 오디오 2-Stage 정밀 싱크 실행"
          >
            <Sparkles className="w-3.5 h-3.5" /> 🤖 AI 정밀 싱크
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] rounded-xl text-center font-bold animate-fade-in">
          {saveSuccessMsg}
        </div>
      )}
    </div>
  );
};
