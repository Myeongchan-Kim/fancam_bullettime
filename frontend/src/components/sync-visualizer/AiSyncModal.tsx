import React from 'react';
import { X, Compass, Sparkles, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';

interface AiSyncModalProps {
  isOpen: boolean;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  aiSyncTargetVideo: SyncGraphVideoNode | null;
  aiSyncResult: any;
  aiSyncError: string | null;
  onClose: () => void;
}

export const AiSyncModal: React.FC<AiSyncModalProps> = ({
  isOpen,
  isAiSyncing,
  isRoughSyncing,
  aiSyncTargetVideo,
  aiSyncResult,
  aiSyncError,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl shadow-emerald-950/80 relative text-center">
        {/* Close button if not running */}
        {!isAiSyncing && !isRoughSyncing && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Target Video Info */}
        <div className="mb-4">
          <span className="px-2.5 py-1 bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-xs rounded-full font-mono font-bold">
            Video #{aiSyncTargetVideo?.id}
          </span>
          <h3 className="text-base font-bold text-white mt-2 truncate">
            {aiSyncTargetVideo?.title}
          </h3>
        </div>

        {/* Running State with Spinner */}
        {(isAiSyncing || isRoughSyncing) && (
          <div className="py-6 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-amber-500 border-r-twice-magenta animate-spin" />
              {isRoughSyncing ? (
                <Compass className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
              ) : (
                <Sparkles className="w-6 h-6 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
              )}
            </div>

            <div className="space-y-1.5">
              <h4 className="text-sm font-bold text-white">
                {isRoughSyncing ? '영상 설명란 및 세트리스트 탐색 중...' : 'AI 2-Stage 정밀 싱크 분석 중...'}
              </h4>
              <p className="text-xs text-gray-400">
                {isRoughSyncing 
                  ? '유튜브 설명란 타임스탬프와 콘서트 세트리스트를 대조하여 대략적 위치를 빠르게 도출합니다.'
                  : 'Stage 1: Gemini Vision 화면 의상/안무 분석\nStage 2: 3-Point 오디오 서브세컨드 파형 정밀 정렬'}
              </p>
            </div>
          </div>
        )}

        {/* Success Result State */}
        {!isAiSyncing && !isRoughSyncing && aiSyncResult && (
          <div className="py-4 space-y-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              aiSyncResult.isRough ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
            }`}>
              {aiSyncResult.isRough ? <MapPin className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
            </div>

            <div className="space-y-1">
              <h4 className={`text-sm font-bold ${aiSyncResult.isRough ? 'text-amber-300' : 'text-emerald-300'}`}>
                {aiSyncResult.isRough ? '대략적 위치 안착 성공!' : 'AI 정밀 싱크 성공!'}
              </h4>
              <p className="text-xs text-gray-400">
                {aiSyncResult.isRough
                  ? '세트리스트 위치에 안착되었습니다. 이제 슬라이더나 정밀 싱크로 미세 조정할 수 있습니다.'
                  : '오프셋이 마스터 영상에 0.01초 단위로 정확히 잠겼습니다.'}
              </p>
            </div>

            <div className="bg-slate-950/80 rounded-2xl p-3 border border-slate-800 text-left space-y-2 text-xs font-mono">
              {aiSyncResult.reason && (
                <div className="text-[11px] text-amber-400/90 pb-1 border-b border-slate-800 font-sans">
                  💡 {aiSyncResult.reason}
                </div>
              )}
              <div className="flex justify-between items-center text-gray-400">
                <span>이전 오프셋:</span>
                <span className="text-gray-300">{aiSyncResult.previous_offset}s</span>
              </div>
              <div className="flex justify-between items-center text-amber-400 font-bold">
                <span>안착 오프셋:</span>
                <span>{aiSyncResult.new_offset}s (Δ {aiSyncResult.delta >= 0 ? `+${aiSyncResult.delta}` : aiSyncResult.delta}s)</span>
              </div>
              {aiSyncResult.parent_video_id && (
                <div className="flex justify-between items-center text-sky-400">
                  <span>연결된 기준(Anchor):</span>
                  <span>#{aiSyncResult.parent_video_id} (상대: {aiSyncResult.relative_offset}s)</span>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className={`w-full py-2.5 text-white rounded-xl font-bold text-xs transition-all shadow-lg ${
                aiSyncResult.isRough 
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950'
              }`}
            >
              확인 및 스튜디오로 복귀
            </button>
          </div>
        )}

        {/* Error State */}
        {!isAiSyncing && !isRoughSyncing && aiSyncError && (
          <div className="py-4 space-y-4">
            <div className="w-12 h-12 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mx-auto text-rose-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-rose-300">싱크 조정 실패</h4>
              <p className="text-xs text-rose-200/80 break-words">
                {aiSyncError}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs transition-all"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
