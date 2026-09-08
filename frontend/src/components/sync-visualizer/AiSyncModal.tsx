import React from 'react';
import { X, Compass, Sparkles, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';

interface RoughCandidate {
  id: string;
  name: string;
  estimated_offset: number;
  reason: string;
  confidence: number;
  badge: string;
  parent_video_id?: number | null;
}

interface AiSyncModalProps {
  isOpen: boolean;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  aiSyncTargetVideo: SyncGraphVideoNode | null;
  aiSyncResult: any;
  aiSyncError: string | null;
  onClose: () => void;
  onApplyCandidate?: (candidate: RoughCandidate) => void;
}

export const AiSyncModal: React.FC<AiSyncModalProps> = ({
  isOpen,
  isAiSyncing,
  isRoughSyncing,
  aiSyncTargetVideo,
  aiSyncResult,
  aiSyncError,
  onClose,
  onApplyCandidate
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl shadow-emerald-950/80 relative text-center">
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
                {isRoughSyncing ? '세트리스트 및 비주얼 화면 그룹 매칭 분석 중...' : 'AI 2-Stage 정밀 싱크 분석 중...'}
              </h4>
              <p className="text-xs text-gray-400">
                {isRoughSyncing 
                  ? '알고리즘 A(세트리스트/설명란)와 알고리즘 B(비주얼 프레임 매칭)를 동시에 탐색 중입니다.'
                  : 'Stage 1: Gemini Vision 화면 의상/안무 분석\nStage 2: 3-Point 오디오 서브세컨드 파형 정밀 정렬'}
              </p>
            </div>
          </div>
        )}

        {/* Rough Sync Candidates Selection Mode */}
        {!isAiSyncing && !isRoughSyncing && aiSyncResult?.isCandidateSelection && (
          <div className="py-2 space-y-4 text-left">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center mx-auto text-amber-400 mb-2">
                <Compass className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-amber-300">🎯 대략적 위치 추천 결과 선택</h4>
              <p className="text-xs text-gray-400">
                원하는 추천 위치를 선택하면 해당 오프셋으로 안착됩니다.
              </p>
            </div>

            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {aiSyncResult.candidates?.map((cand: RoughCandidate, idx: number) => {
                const isVisual = cand.id === 'visual_matching';
                const formattedTime = `${Math.floor(cand.estimated_offset / 60)}분 ${Math.floor(cand.estimated_offset % 60)}초 (${cand.estimated_offset}s)`;
                return (
                  <div
                    key={cand.id || idx}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isVisual 
                        ? 'bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border-purple-500/50 hover:border-purple-400' 
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white">{cand.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          isVisual ? 'bg-purple-900/80 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-gray-300'
                        }`}>
                          {cand.badge}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {formattedTime}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                      💡 {cand.reason}
                    </p>

                    <button
                      onClick={() => onApplyCandidate && onApplyCandidate(cand)}
                      className={`w-full py-1.5 text-xs font-bold rounded-xl transition-all shadow-md ${
                        isVisual
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-gray-200'
                      }`}
                    >
                      이 위치로 안착 적용
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 bg-slate-800/80 hover:bg-slate-800 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
            >
              취소
            </button>
          </div>
        )}

        {/* Success Result State (After Applying) */}
        {!isAiSyncing && !isRoughSyncing && aiSyncResult && !aiSyncResult.isCandidateSelection && (
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
                  ? '선택하신 위치에 성공적으로 안착되었습니다. 이제 슬라이더로 미세 조정하거나 정밀 싱크를 진행할 수 있습니다.'
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

