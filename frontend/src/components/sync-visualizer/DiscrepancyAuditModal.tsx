import React from 'react';
import { X, Compass } from 'lucide-react';
import { SyncGraphData, SyncGraphVideoNode } from '../../types';

interface DiscrepancyAuditModalProps {
  isOpen: boolean;
  isAuditing: boolean;
  auditData: any;
  graphData: SyncGraphData | null;
  onClose: () => void;
  onSelectVideoForInspection: (video: SyncGraphVideoNode, expectedOffset: number) => void;
  onTriggerRoughSyncForVideo: (video: SyncGraphVideoNode) => void;
}

export const DiscrepancyAuditModal: React.FC<DiscrepancyAuditModalProps> = ({
  isOpen,
  isAuditing,
  auditData,
  graphData,
  onClose,
  onSelectVideoForInspection,
  onTriggerRoughSyncForVideo
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-2xl w-full shadow-2xl shadow-amber-950/80 relative text-left max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                콘서트 타임라인 정합성 지능형 진단
              </h3>
              <p className="text-xs text-gray-400">
                수동 검증된 영상은 안전하게 보존하며, 미검증/의심 영상의 위치를 선별 진단합니다.
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
              <p className="text-xs text-gray-400">세트리스트 및 비주얼 지문 대조 분석 중...</p>
            </div>
          )}

          {!isAuditing && auditData && (
            <>
              <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="text-xs">
                  <span className="text-gray-400">진단 상태: </span>
                  <span className="font-bold text-white font-mono">
                    {auditData.count > 0 ? (
                      <span className="text-amber-400">{auditData.count}개의 미검증 의심 영상 발견</span>
                    ) : (
                      <span className="text-emerald-400">모든 직캠이 검증 완료되었거나 정상 범위 내에 있습니다! ✨</span>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">
                  (수동 검증 완료된 영상은 자동 제외됨)
                </div>
              </div>

              {auditData.discrepancies && auditData.discrepancies.length > 0 ? (
                <div className="space-y-2.5 mt-2">
                  {auditData.discrepancies.map((item: any) => {
                    const found = graphData?.videos?.find(v => v.id === item.video_id);
                    return (
                      <div
                        key={`audit-${item.video_id}`}
                        className="p-3.5 bg-slate-950/60 hover:bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-400 px-1.5 py-0.5 bg-amber-950/40 rounded border border-amber-500/30">
                              #{item.video_id}
                            </span>
                            <span className="text-white font-semibold truncate">{item.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-1.5 font-mono">
                            <span>곡: <span className="text-sky-300 font-bold">{item.matched_song}</span></span>
                            <span>현재: <span className="text-gray-200">{item.current_offset}s</span></span>
                            <span>세트리스트: <span className="text-gray-200">{item.expected_offset}s</span></span>
                            <span className="text-rose-400 font-bold">오차: {item.discrepancy_seconds}s</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {found && (
                            <button
                              onClick={() => {
                                onClose();
                                onTriggerRoughSyncForVideo(found);
                              }}
                              className="px-2.5 py-1.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-500 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-[11px] font-bold transition-all shadow-md flex items-center gap-1 hover:scale-105 active:scale-95"
                              title="세트리스트 vs 비주얼 매칭 결과 선택창 열기"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              대략적 위치 찾기
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (found) {
                                onSelectVideoForInspection(found, item.expected_offset);
                              }
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-xl text-[11px] font-bold transition-all flex-shrink-0"
                          >
                            데크 B로 열기
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

