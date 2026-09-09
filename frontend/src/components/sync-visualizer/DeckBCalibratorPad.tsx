import React, { useRef, useState } from 'react';
import { Sliders, RotateCcw, GripVertical, Save, ShieldCheck, Compass, Sparkles, Layers, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';
import { getActiveSegment } from '../../utils/syncGraphCalculations';

interface DeckBCalibratorPadProps {
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode;
  fineTuneDelta: number;
  selectedTimeCursor: number;
  isSavingOffset: boolean;
  saveSuccessMsg: string | null;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  isLoadingCalibrator: boolean;
  formatTime: (sec: number) => string;
  onResetFineTune: () => void;
  onDeltaChange: (newDelta: number) => void;
  onNudge: (amount: number) => void;
  onSaveOffset: () => void;
  onOpenCalibrator: (video: SyncGraphVideoNode, hasSegments: boolean) => void;
  onTriggerRoughSync: (video: SyncGraphVideoNode) => void;
  onTriggerAiSync: (video: SyncGraphVideoNode) => void;
}

export const DeckBCalibratorPad: React.FC<DeckBCalibratorPadProps> = ({
  videoA,
  videoB,
  fineTuneDelta,
  selectedTimeCursor,
  isSavingOffset,
  saveSuccessMsg,
  isAiSyncing,
  isRoughSyncing,
  isLoadingCalibrator,
  formatTime,
  onResetFineTune,
  onDeltaChange,
  onNudge,
  onSaveOffset,
  onOpenCalibrator,
  onTriggerRoughSync,
  onTriggerAiSync
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

  // Deck B target parameters (Segment vs Full Video)
  // For split videos, we work in master timeline coordinates:
  // baseMasterStart = activeSegment.master_start, duration = video_end - video_start
  const baseMasterStartB = activeSegment 
    ? activeSegment.master_start 
    : (videoB.master_start_time !== undefined && videoB.master_start_time !== null 
        ? videoB.master_start_time 
        : (videoB.sync_offset || 0));

  const durB = activeSegment 
    ? Math.max(1, (activeSegment.video_end - activeSegment.video_start)) 
    : (videoB.duration || 240);

  // The effective offset being calibrated
  const baseOffset = activeSegment ? activeSegment.sync_offset : (videoB.sync_offset || 0);
  const currentEffectiveOffset = Number((baseOffset + fineTuneDelta).toFixed(2));

  // Current active Deck B segment's live master start position (shifted by fineTuneDelta)
  const currentMasterStartB = baseMasterStartB + fineTuneDelta;
  const currentMasterEndB = currentMasterStartB + durB;

  // Viewport window offset shift (allows scrolling the comparison window by ±10 minutes)
  const [viewportShift, setViewportShift] = useState<number>(0);

  // Timeline view window: Deck B active bar length + margin of ±10 minutes (600s left, 600s right)
  const MARGIN_SECONDS = 600; // 10 minutes
  const timelineSpan = durB + MARGIN_SECONDS * 2; // Total width = bar length + 20 minutes

  // The base reference position for the window is the saved base master start + viewportShift.
  // CRITICAL: We DO NOT add fineTuneDelta to the window anchor!
  // This keeps the track background completely fixed while the active bar itself moves smoothly inside it when dragged.
  const windowAnchor = baseMasterStartB + viewportShift;
  const timelineMin = windowAnchor - MARGIN_SECONDS;
  const timelineMax = timelineMin + timelineSpan;

  // Pointer drag state & ref
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startDelta: number; trackWidth: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackContainerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = trackContainerRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startDelta: fineTuneDelta,
      trackWidth: Math.max(rect.width, 1)
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragRef.current) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaTime = (deltaX / dragRef.current.trackWidth) * timelineSpan;
    const newDelta = Math.round((dragRef.current.startDelta + deltaTime) * 20) / 20; // 0.05s snap step

    onDeltaChange(Number(newDelta.toFixed(2)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

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
          {fineTuneDelta !== 0 && (
            <button
              onClick={onResetFineTune}
              className="text-[10px] font-bold text-gray-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-all flex items-center gap-1"
              title="원래 오프셋으로 되돌리기"
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
          <span className="text-[9px] text-gray-500">
            타임라인 윈도우: {formatTime(timelineMin)} ─── {formatTime(timelineMax)}
          </span>
        </div>

        {/* Row 1: Deck A Reference Bar (Fixed) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span className="text-sky-300 font-bold flex items-center gap-1 truncate max-w-[340px]">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
              [Deck A 기준] #{videoA?.id || '?'} {videoA?.title || '기준 영상'}
            </span>
            <span className="text-[10px] text-gray-400 shrink-0">
              위치: {formatTime(startA)} ── {formatTime(endA)} ({formatTime(durA)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Spacer matching Row 2 left button */}
            <div className="w-[43px] shrink-0" aria-hidden="true" />

            {/* Deck A Track Container */}
            <div className="flex-1 h-5 bg-slate-900 rounded-lg overflow-hidden relative border border-sky-500/20">
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
                    className="absolute top-0 bottom-0 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-sm shadow-sm transition-all flex items-center px-2"
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
            {/* Shift viewport left by 10 minutes (-600s) */}
            <button
              type="button"
              onClick={() => setViewportShift(prev => prev - 600)}
              className="h-8 px-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm active:scale-95 group"
              title="타임라인 구간을 10분 앞으로 이동 (-10분)"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-twice-magenta group-hover:-translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline font-mono text-[9px] mr-0.5">-10m</span>
            </button>

            {/* Draggable Track Container (contains all segments of Deck B) */}
            <div
              ref={trackContainerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`flex-1 h-8 bg-slate-900 rounded-lg overflow-hidden relative select-none cursor-grab active:cursor-grabbing border ${
                isDragging ? 'border-twice-magenta ring-2 ring-twice-magenta/40' : 'border-twice-magenta/30 hover:border-twice-magenta/60'
              } transition-colors`}
              title="마우스 또는 터치로 바를 좌우로 드래그하여 싱크를 미세 조정하세요 (0.05초 단위)"
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
                  const widthPct = Math.max(2, rightPct - leftPct);

                  if (isActive) {
                    return (
                      <div
                        key={seg.id}
                        className="absolute top-0 bottom-0 rounded-sm flex items-center justify-between px-2 bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-2 ring-white/60 transition-transform z-10"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`
                        }}
                        title={`현재 편집 중인 구간: ${seg.label || `#${seg.id}`} (${formatTime(segMasterStart)} ~ ${formatTime(segMasterEnd)})`}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
                        <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-1 uppercase">
                          {isDragging 
                            ? `Offset: ${currentEffectiveOffset.toFixed(2)}s (${fineTuneDelta >= 0 ? `+${fineTuneDelta.toFixed(2)}` : fineTuneDelta.toFixed(2)}s)` 
                            : `${seg.label || `구간 #${seg.id}`} (드래그 조절)`}
                        </span>
                        <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
                      </div>
                    );
                  }

                  // Non-active other split segments (styled distinctively to show surrounding segments)
                  return (
                    <div
                      key={seg.id}
                      className="absolute top-0.5 bottom-0.5 rounded-sm flex items-center px-1.5 bg-pink-900/60 hover:bg-pink-800/80 border border-pink-500/40 opacity-75 hover:opacity-100 transition-opacity z-0"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`
                      }}
                      title={`구간: ${seg.label || `#${seg.id}`} (${formatTime(segMasterStart)} ~ ${formatTime(segMasterEnd)})`}
                    >
                      <span className="text-[8px] font-bold text-pink-200 truncate drop-shadow">
                        {seg.label || `구간 #${seg.id}`}
                      </span>
                    </div>
                  );
                })
              ) : (
                /* Continuous video (single bar) */
                (() => {
                  const leftPct = Math.max(0, Math.min(96, ((currentMasterStartB - timelineMin) / timelineSpan) * 100));
                  const widthPct = Math.max(4, Math.min(100, (durB / timelineSpan) * 100));
                  return (
                    <div
                      className="absolute top-0 bottom-0 rounded-sm flex items-center justify-between px-2 bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-1 ring-white/30 transition-transform"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`
                      }}
                    >
                      <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
                      <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-1 uppercase">
                        {isDragging 
                          ? `Offset: ${currentEffectiveOffset.toFixed(2)}s (${fineTuneDelta >= 0 ? `+${fineTuneDelta.toFixed(2)}` : fineTuneDelta.toFixed(2)}s)` 
                          : '드래그하여 싱크 조절 (Drag to Sync)'}
                      </span>
                      <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
                    </div>
                  );
                })()
              )}
            </div>

            {/* Shift viewport right by 10 minutes (+600s) */}
            <button
              type="button"
              onClick={() => setViewportShift(prev => prev + 600)}
              className="h-8 px-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-lg border border-slate-700 transition-all flex items-center justify-center text-[10px] font-bold shrink-0 shadow-sm active:scale-95 group"
              title="타임라인 구간을 10분 뒤로 이동 (+10분)"
            >
              <span className="hidden sm:inline font-mono text-[9px] ml-0.5">+10m</span>
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
        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5">
          <span>💡 단축키:</span>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">←</kbd>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">→</kbd> (0.5s)
          <span className="text-gray-600">│</span>
          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded text-[9px]">Shift</kbd> + 방향키 (0.1s)
        </div>

        <div className="flex items-center gap-2">
          {fineTuneDelta !== 0 && (
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
                  <span>{activeSegment ? `구간 [${activeSegment.label || `#${activeSegment.id}`}] 오프셋 저장` : '오프셋 영구 저장'}</span>
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
