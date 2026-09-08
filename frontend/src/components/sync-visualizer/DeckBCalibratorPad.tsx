import React, { useRef, useState } from 'react';
import { Sliders, RotateCcw, GripVertical, Save, ShieldCheck, Compass, Sparkles, Layers, Scissors } from 'lucide-react';
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

  // Durations & Start times
  const durA = videoA?.duration || 240;
  const startA = videoA ? (videoA.sync_offset || 0) : 0;
  const endA = startA + durA;

  // Deck B target parameters (Segment vs Full Video)
  const targetOffset = activeSegment ? activeSegment.sync_offset : (videoB.sync_offset || 0);
  const currentEffectiveOffset = Number((targetOffset + fineTuneDelta).toFixed(2));
  const durB = activeSegment 
    ? Math.max(1, (activeSegment.video_end - activeSegment.video_start)) 
    : (videoB.duration || 240);
  const startB = currentEffectiveOffset;
  const endB = startB + durB;

  // Timeline view window
  const timelineMin = Math.max(0, Math.min(startA, startB) - 25);
  const timelineMax = Math.max(endA, endB) + 25;
  const timelineSpan = Math.max(1, timelineMax - timelineMin);

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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                <Scissors className="w-2.5 h-2.5" />
                구간: {activeSegment.label || `#${activeSegment.id}`}
              </span>
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
              +{currentEffectiveOffset.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>

      {/* 2-Row Interactive Timeline Comparison Tracks (Deck A vs Deck B) */}
      <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800 space-y-2">
        <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
          <span className="flex items-center gap-1.5 text-gray-300 font-bold">
            <Layers className="w-3 h-3 text-twice-apricot" />
            2-Track 타임라인 바 비교 {activeSegment && <span className="text-amber-400 font-bold">(선택된 Split 구간 편집 중)</span>}
          </span>
          <span className="text-[9px] text-gray-500">
            {formatTime(timelineMin)} ─── {formatTime(timelineMax)}
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
              Offset: {startA.toFixed(2)}s ({formatTime(durA)})
            </span>
          </div>
          <div className="h-4 bg-slate-900 rounded-lg overflow-hidden relative border border-sky-500/20">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-md shadow-sm transition-all"
              style={{
                marginLeft: `${Math.max(0, ((startA - timelineMin) / timelineSpan) * 100)}%`,
                width: `${Math.max(2, Math.min(100, (durA / timelineSpan) * 100))}%`
              }}
            />
          </div>
        </div>

        {/* Row 2: Deck B Draggable Target Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span className="text-twice-magenta font-bold flex items-center gap-1 truncate max-w-[340px]">
              <span className="w-2 h-2 rounded-full bg-twice-magenta animate-pulse" />
              [Deck B {activeSegment ? `구간: ${activeSegment.label || `#${activeSegment.id}`}` : '대상'}] #{videoB.id} {videoB.title}
            </span>
            <span className="text-[10px] text-twice-magenta font-bold shrink-0">
              Offset: {currentEffectiveOffset.toFixed(2)}s ({formatTime(durB)})
            </span>
          </div>

          <div
            ref={trackContainerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`h-6 bg-slate-900 rounded-lg overflow-hidden relative select-none cursor-grab active:cursor-grabbing border ${
              isDragging ? 'border-twice-magenta ring-2 ring-twice-magenta/40' : 'border-twice-magenta/30 hover:border-twice-magenta/60'
            } transition-colors`}
            title="마우스 또는 터치로 바를 좌우로 드래그하여 싱크를 미세 조정하세요 (0.05초 단위)"
          >
            <div
              className="h-full rounded-md flex items-center justify-between px-2 bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-1 ring-white/30 transition-transform"
              style={{
                marginLeft: `${Math.max(0, ((startB - timelineMin) / timelineSpan) * 100)}%`,
                width: `${Math.max(4, Math.min(100, (durB / timelineSpan) * 100))}%`
              }}
            >
              <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
              <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-1 uppercase">
                {isDragging ? `Offset: ${currentEffectiveOffset.toFixed(2)}s (${fineTuneDelta >= 0 ? `+${fineTuneDelta.toFixed(2)}` : fineTuneDelta.toFixed(2)}s)` : activeSegment ? `구간 드래그 싱크 (${activeSegment.label || `#${activeSegment.id}`})` : '드래그하여 싱크 조절 (Drag to Sync)'}
              </span>
              <GripVertical className="h-3.5 w-3.5 text-white/90 shrink-0 drop-shadow" />
            </div>
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
