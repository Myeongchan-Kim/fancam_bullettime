import React from 'react';
import { X, Compass, RefreshCw } from 'lucide-react';
import { SyncGraphData, SyncGraphVideoNode } from '../../types';

interface DiscrepancyAuditModalProps {
  isOpen: boolean;
  isAuditing: boolean;
  auditData: any;
  isBatchAligning: boolean;
  batchAlignResult: any;
  graphData: SyncGraphData | null;
  onClose: () => void;
  onBatchAlign: () => void;
  onSelectVideoForInspection: (video: SyncGraphVideoNode, expectedOffset: number) => void;
}

export const DiscrepancyAuditModal: React.FC<DiscrepancyAuditModalProps> = ({
  isOpen,
  isAuditing,
  auditData,
  isBatchAligning,
  batchAlignResult,
  graphData,
  onClose,
  onBatchAlign,
  onSelectVideoForInspection
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-2xl w-full shadow-2xl shadow-amber-950/80 relative text-left max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                콘서트 타임라인 정합성 진단 & 일괄 재배치
              </h3>
              <p className="text-xs text-gray-400">
                공식 세트리스트 곡 시작 시각과 2분 이상 크게 어긋난 직캠을 색출하고 자동 안착합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {isAuditing && (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-amber-500 animate-spin" />
              <p className="text-xs text-gray-400">세트리스트와 전체 직캠 대조 분석 중...</p>
            </div>
          )}

          {!isAuditing && auditData && (
            <>
              <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="text-xs">
                  <span className="text-gray-400">진단 결과: </span>
                  <span className="font-bold text-white font-mono">
                    {auditData.count > 0 ? (
                      <span className="text-amber-400">{auditData.count}개의 영상 위치 어긋남 감지</span>
                    ) : (
                      <span className="text-emerald-400">모든 직캠이 세트리스트 정상 범위 내에 있습니다! ✨</span>
                    )}
                  </span>
                </div>

                {auditData.count > 0 && (
                  <button
                    onClick={onBatchAlign}
                    disabled={isBatchAligning}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-amber-950/50 transition-all disabled:opacity-50"
                  >
                    {isBatchAligning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        일괄 재배치 중...
                      </>
                    ) : (
                      <>
                        <Compass className="w-3.5 h-3.5" />
                        {auditData.count}개 전체 일괄 안착 실행
                      </>
                    )}
                  </button>
                )}
              </div>

              {batchAlignResult && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl text-xs text-emerald-300">
                  🎉 <b>일괄 안착 완료:</b> 총 {batchAlignResult.aligned_count}개의 영상이 세트리스트 정위치로 재배치되었습니다.
                </div>
              )}

              {auditData.discrepancies && auditData.discrepancies.length > 0 ? (
                <div className="space-y-2 mt-2">
                  {auditData.discrepancies.map((item: any) => (
                    <div
                      key={`audit-${item.video_id}`}
                      className="p-3 bg-slate-950/50 hover:bg-slate-800/50 rounded-2xl border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-400">#{item.video_id}</span>
                          <span className="text-white font-semibold truncate">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-1 font-mono">
                          <span>곡: <span className="text-sky-300 font-bold">{item.matched_song}</span></span>
                          <span>현재: {item.current_offset}s</span>
                          <span>세트리스트: {item.expected_offset}s</span>
                          <span className="text-rose-400 font-bold">오차: {item.discrepancy_seconds}s</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const found = graphData?.videos?.find(v => v.id === item.video_id);
                          if (found) {
                            onSelectVideoForInspection(found, item.expected_offset);
                          }
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-lg text-[11px] font-bold transition-all flex-shrink-0"
                      >
                        데크 B로 확인
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
