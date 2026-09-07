import React from 'react';
import { Layers } from 'lucide-react';
import { SyncGraphVideoNode } from '../../types';
import { calculateLocalSeekTime } from '../../utils/syncGraphCalculations';

interface OverlappingVideosListProps {
  overlappingVideos: SyncGraphVideoNode[];
  selectedTimeCursor: number;
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode | null;
  formatTime: (sec: number) => string;
  onSelectVideoA: (v: SyncGraphVideoNode) => void;
  onSelectVideoB: (v: SyncGraphVideoNode) => void;
  onCardClick: (v: SyncGraphVideoNode) => void;
}

export const OverlappingVideosList: React.FC<OverlappingVideosListProps> = ({
  overlappingVideos,
  selectedTimeCursor,
  videoA,
  videoB,
  formatTime,
  onSelectVideoA,
  onSelectVideoB,
  onCardClick
}) => {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md space-y-2.5">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-black text-white">
          <Layers className="w-4 h-4 text-twice-apricot" />
          <span>동시 촬영된 다각도 직캠 ({overlappingVideos.length}개)</span>
        </div>
        <span className="text-[10px] font-mono text-gray-400">
          ⏱️ 타임라인 시점: {formatTime(selectedTimeCursor)}
        </span>
      </div>

      {overlappingVideos.length === 0 ? (
        <div className="py-4 text-center text-gray-500 font-mono text-xs">
          이 시점에 동시 촬영된 영상이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
          {overlappingVideos.map((v) => {
            const isDeckA = videoA?.id === v.id;
            const isDeckB = videoB?.id === v.id;
            const isUncalibrated = !v.is_master && ((v.calibration_count || 0) === 0 || v.status === 'uncalibrated');
            const isAI = v.status === 'ai_calibrated';
            const isDrift = v.status === 'drift_warning';
            const vSeek = calculateLocalSeekTime(v, selectedTimeCursor);

            return (
              <div
                key={v.id}
                onClick={() => onCardClick(v)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                  isDeckB
                    ? 'bg-twice-magenta/20 border-twice-magenta text-white shadow-md ring-1 ring-twice-magenta/40'
                    : isDeckA
                    ? 'bg-sky-500/20 border-sky-400 text-white shadow-md ring-1 ring-sky-400/40'
                    : isUncalibrated
                    ? 'bg-slate-800/80 border-dashed border-amber-500/50 hover:bg-slate-800 text-gray-300'
                    : 'bg-slate-800/70 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-gray-300'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-16 h-10 rounded-lg overflow-hidden bg-black flex-shrink-0 relative">
                  <img
                    src={`https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`}
                    alt={v.title}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[7px] font-mono font-bold text-white px-1 rounded">
                    {formatTime(vSeek)}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-black text-white truncate max-w-[120px] flex items-center gap-1">
                      <span className="text-purple-400 font-mono">#{v.id}</span>
                      <span className="truncate">{v.title}</span>
                    </span>
                    
                    {/* Deck Assign Badges */}
                    <div className="flex items-center gap-1 font-mono flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideoA(v);
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black transition-all ${
                          isDeckA 
                            ? 'bg-sky-500 text-white shadow ring-1 ring-white' 
                            : 'bg-slate-800 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30'
                        }`}
                        title="Deck A (좌측 레퍼런스)로 지정"
                      >
                        Deck A
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideoB(v);
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black transition-all ${
                          isDeckB 
                            ? 'bg-twice-magenta text-white shadow ring-1 ring-white' 
                            : 'bg-slate-800 hover:bg-twice-magenta/30 text-twice-magenta border border-twice-magenta/30'
                        }`}
                        title="Deck B (우측 타겟 직캠)로 지정"
                      >
                        Deck B
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-0.5 text-[9px]">
                    <p className="text-gray-400 truncate flex-1">
                      {v.members && v.members.length > 0 && (
                        <span className="text-twice-apricot mr-1 font-semibold">[{v.members.join(', ')}]</span>
                      )}
                      {v.title}
                    </p>
                    {isUncalibrated ? (
                      <span className="text-[7px] font-bold text-amber-300 bg-amber-950/80 px-1 rounded border border-amber-500/50 flex-shrink-0">
                        ⚠️ 미보정
                      </span>
                    ) : isAI ? (
                      <span className="text-[7px] font-bold text-emerald-300 bg-emerald-950/80 px-1 rounded border border-emerald-500/50 flex-shrink-0">
                        🤖 AI({v.calibration_count || 1})
                      </span>
                    ) : isDrift ? (
                      <span className="text-[7px] font-bold text-rose-400 bg-rose-950/80 px-1 rounded border border-rose-500/50 flex-shrink-0">
                        🔴 오차
                      </span>
                    ) : (
                      <span className="text-[7px] font-bold text-purple-300 bg-purple-950/80 px-1 rounded border border-purple-500/50 flex-shrink-0">
                        ✅ 검증({v.calibration_count || 1})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
