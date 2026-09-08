import React from 'react';
import { Sliders, RotateCcw, MoveHorizontal, Save, ShieldCheck, Compass, Sparkles } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';

interface DeckBCalibratorPadProps {
  videoB: SyncGraphVideoNode;
  fineTuneDelta: number;
  effectiveOffsetB: number;
  isSavingOffset: boolean;
  saveSuccessMsg: string | null;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  isLoadingCalibrator: boolean;
  onResetFineTune: () => void;
  onDeltaChange: (newDelta: number) => void;
  onNudge: (amount: number) => void;
  onSaveOffset: () => void;
  onOpenCalibrator: (video: SyncGraphVideoNode, hasSegments: boolean) => void;
  onTriggerRoughSync: (video: SyncGraphVideoNode) => void;
  onTriggerAiSync: (video: SyncGraphVideoNode) => void;
}

export const DeckBCalibratorPad: React.FC<DeckBCalibratorPadProps> = ({
  videoB,
  fineTuneDelta,
  effectiveOffsetB,
  isSavingOffset,
  saveSuccessMsg,
  isAiSyncing,
  isRoughSyncing,
  isLoadingCalibrator,
  onResetFineTune,
  onDeltaChange,
  onNudge,
  onSaveOffset,
  onOpenCalibrator,
  onTriggerRoughSync,
  onTriggerAiSync
}) => {
  if (videoB.is_master) return null;

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
              +{effectiveOffsetB.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>

      {/* Smooth Scrubber Range Slider (빠른 이동) */}
      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
        <div className="flex justify-between items-center text-[9px] text-gray-400 font-mono">
          <span>-30s</span>
          <span className="text-twice-magenta font-bold flex items-center gap-1">
            <MoveHorizontal className="w-2.5 h-2.5 animate-pulse" /> 슬라이더로 빠른 오프셋 이동 (0.05s)
          </span>
          <span>+30s</span>
        </div>
        <input
          type="range"
          min={Math.max(0, (videoB.sync_offset || 0) - 30)}
          max={(videoB.sync_offset || 0) + 30}
          step={0.05}
          value={effectiveOffsetB}
          onChange={(e) => {
            const newOff = parseFloat(e.target.value);
            onDeltaChange(Number((newOff - videoB.sync_offset).toFixed(2)));
          }}
          className="w-full accent-twice-magenta bg-slate-800 rounded-lg h-1.5 cursor-pointer transition-all hover:bg-slate-700"
        />
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
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950 text-xs transition-all"
            >
              <Save className="w-3.5 h-3.5" /> 오프셋 영구 저장
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
