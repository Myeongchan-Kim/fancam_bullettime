import React, { useState } from 'react';
import { X, Compass, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { SyncGraphData, SyncGraphVideoNode } from '../../types';

interface DiscrepancyAuditModalProps {
  isOpen: boolean;
  isAuditing: boolean;
  auditData: any;
  graphData: SyncGraphData | null;
  onClose: () => void;
  onSelectVideoForInspection: (video: SyncGraphVideoNode, expectedOffset: number) => void;
  onTriggerRoughSyncForVideo: (video: SyncGraphVideoNode) => void;
  onOpenSegmentCalibrator?: (video: SyncGraphVideoNode) => void;
}

export const DiscrepancyAuditModal: React.FC<DiscrepancyAuditModalProps> = ({
  isOpen,
  isAuditing,
  auditData,
  graphData,
  onClose,
  onSelectVideoForInspection,
  onTriggerRoughSyncForVideo,
  onOpenSegmentCalibrator
}) => {
  const [activeTab, setActiveTab] = useState<'discrepancies' | 'segment_overlaps'>('discrepancies');

  if (!isOpen) return null;

  const discrepanciesCount = auditData?.count || 0;
  const overlapsCount = auditData?.segment_overlaps_count || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-3xl w-full shadow-2xl shadow-amber-950/80 relative text-left max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                콘서트 타임라인 정합성 지능형 진단
                {(discrepanciesCount > 0 || overlapsCount > 0) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono">
                    총 {discrepanciesCount + overlapsCount}건 감지
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-400">
                세트리스트 오차 감지 및 같은 영상 내 분할 구간(Segment Split) 중첩 결함을 검출합니다.
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

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-3 p-1 bg-slate-950/80 border border-slate-800 rounded-2xl">
          <button
            onClick={() => setActiveTab('discrepancies')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'discrepancies'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            세트리스트 곡 오차 진단
            {discrepanciesCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'discrepancies' ? 'bg-black/20 text-slate-950 font-black' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {discrepanciesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('segment_overlaps')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'segment_overlaps'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            세그먼트(Split) 중첩 진단
            {overlapsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'segment_overlaps' ? 'bg-black/20 text-slate-950 font-black' : 'bg-rose-500/20 text-rose-400'
              }`}>
                {overlapsCount}
              </span>
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {isAuditing && (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-slate-700 border-t-amber-500 animate-spin" />
              <p className="text-xs text-gray-400">세트리스트 및 분할 구간(Segment) 교차 대조 분석 중...</p>
            </div>
          )}

          {!isAuditing && auditData && activeTab === 'discrepancies' && (
            <>
              <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="text-xs">
                  <span className="text-gray-400">진단 상태: </span>
                  <span className="font-bold text-white font-mono">
                    {discrepanciesCount > 0 ? (
                      <span className="text-amber-400">{discrepanciesCount}개의 미검증 의심 영상 발견</span>
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

          {!isAuditing && auditData && activeTab === 'segment_overlaps' && (
            <>
              <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="text-xs">
                  <span className="text-gray-400">진단 상태: </span>
                  <span className="font-bold text-white font-mono">
                    {overlapsCount > 0 ? (
                      <span className="text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        {overlapsCount}개의 분할 구간(Segment) 중첩 결함 발견
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        모든 영상의 세그먼트가 중첩 없이 올바르게 정렬되어 있습니다! ✨
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500">
                  (동일 영상 내 전후 구간 타임라인 충돌 검출)
                </div>
              </div>

              {auditData.segment_overlaps && auditData.segment_overlaps.length > 0 ? (
                <div className="space-y-2.5 mt-2">
                  {auditData.segment_overlaps.map((item: any, idx: number) => {
                    const found = graphData?.videos?.find(v => v.id === item.video_id);
                    return (
                      <div
                        key={`overlap-${item.video_id}-${idx}`}
                        className="p-3.5 bg-slate-950/60 hover:bg-slate-950 rounded-2xl border border-rose-500/20 hover:border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-rose-400 px-1.5 py-0.5 bg-rose-950/40 rounded border border-rose-500/30">
                              #{item.video_id}
                            </span>
                            <span className="text-white font-semibold truncate">{item.video_title}</span>
                          </div>

                          <div className="mt-2 p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-gray-300">
                              <span className="text-amber-300 font-semibold truncate max-w-[200px]">
                                1️⃣ {item.segment_a.label}
                              </span>
                              <span className="text-gray-400">
                                마스터 [{item.segment_a.master_range[0]}s ~ {item.segment_a.master_range[1]}s]
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-gray-300">
                              <span className="text-sky-300 font-semibold truncate max-w-[200px]">
                                2️⃣ {item.segment_b.label}
                              </span>
                              <span className="text-gray-400">
                                마스터 [{item.segment_b.master_range[0]}s ~ {item.segment_b.master_range[1]}s]
                              </span>
                            </div>
                            <div className="pt-1 border-t border-slate-800 flex items-center justify-between">
                              <span className="text-rose-400 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {item.master_overlap_seconds > 0
                                  ? `마스터 타임라인 상 ${item.master_overlap_seconds}초 겹침`
                                  : `영상 내부 타임라인 상 ${item.video_overlap_seconds}초 겹침`}
                              </span>
                              <span className="text-gray-500 text-[10px]">
                                오프셋: {item.segment_a.sync_offset}s vs {item.segment_b.sync_offset}s
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {found && onOpenSegmentCalibrator && (
                            <button
                              onClick={() => {
                                onClose();
                                onOpenSegmentCalibrator(found);
                              }}
                              className="px-2.5 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-xl text-[11px] font-bold transition-all shadow-md flex items-center gap-1 hover:scale-105 active:scale-95"
                              title="세그먼트 캘리브레이터 창 열기"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              구간 조정창 열기
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (found) {
                                onSelectVideoForInspection(found, item.segment_a.master_range[0]);
                              }
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-xl text-[11px] font-bold transition-all flex-shrink-0"
                          >
                            데크 B로 이동
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

