import React from 'react';
import YouTube, { YouTubePlayer } from 'react-youtube';
import { Link } from 'react-router-dom';
import { Maximize2 } from 'lucide-react';
import { SyncGraphData, SyncGraphVideoNode } from '../../types';
import { DeckBCalibratorPad } from './DeckBCalibratorPad';
import { calculateLocalSeekTime } from '../../utils/syncGraphCalculations';

interface DeckPlayersViewProps {
  playerMode: 'DUAL' | 'QUAD' | 'SINGLE';
  videoA: SyncGraphVideoNode | null;
  videoB: SyncGraphVideoNode | null;
  activeDeckSlot: 'A' | 'B';
  graphData: SyncGraphData | null;
  selectedTimeCursor: number;
  fineTuneDelta: number;
  effectiveOffsetB: number;
  playerOpts: any;
  isMuted: boolean;
  activeAudioSource: string;
  isSavingOffset: boolean;
  saveSuccessMsg: string | null;
  isAiSyncing: boolean;
  isRoughSyncing: boolean;
  isLoadingCalibrator: boolean;
  overlappingVideos: SyncGraphVideoNode[];
  formatTime: (sec: number) => string;
  setVideoA: (v: SyncGraphVideoNode) => void;
  setVideoB: (v: SyncGraphVideoNode) => void;
  setActiveDeckSlot: (slot: 'A' | 'B') => void;
  setPlayerA: (p: YouTubePlayer) => void;
  setPlayerB: (p: YouTubePlayer) => void;
  onResetFineTune: () => void;
  onDeltaChange: (newDelta: number) => void;
  onNudge: (amount: number) => void;
  onSaveOffset: () => void;
  onOpenCalibrator: (video: SyncGraphVideoNode, hasSegments: boolean) => void;
  onTriggerRoughSync: (video: SyncGraphVideoNode) => void;
  onTriggerAiSync: (video: SyncGraphVideoNode) => void;
}

export const DeckPlayersView: React.FC<DeckPlayersViewProps> = ({
  playerMode,
  videoA,
  videoB,
  activeDeckSlot,
  graphData,
  selectedTimeCursor,
  fineTuneDelta,
  effectiveOffsetB,
  playerOpts,
  isMuted,
  activeAudioSource,
  isSavingOffset,
  saveSuccessMsg,
  isAiSyncing,
  isRoughSyncing,
  isLoadingCalibrator,
  overlappingVideos,
  formatTime,
  setVideoA,
  setVideoB,
  setActiveDeckSlot,
  setPlayerA,
  setPlayerB,
  onResetFineTune,
  onDeltaChange,
  onNudge,
  onSaveOffset,
  onOpenCalibrator,
  onTriggerRoughSync,
  onTriggerAiSync
}) => {
  const seekTimeA = calculateLocalSeekTime(videoA, selectedTimeCursor);
  const seekTimeB = calculateLocalSeekTime(videoB, selectedTimeCursor, fineTuneDelta);

  return (
    <>
      {/* Main Multi-Video Player Grid: DUAL */}
      {playerMode === 'DUAL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Deck: Video A */}
          <div className={`bg-slate-900/95 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2 transition-all border-2 ${
            activeDeckSlot === 'A' ? 'border-sky-500/70 ring-2 ring-sky-500/30' : 'border-sky-500/30'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[11px] font-mono font-black border border-sky-400/30 flex-shrink-0">
                  A
                </span>
                <select
                  value={videoA?.id || ''}
                  onChange={(e) => {
                    const targetId = parseInt(e.target.value, 10);
                    const found = graphData?.videos?.find(v => v.id === targetId);
                    if (found) setVideoA(found);
                  }}
                  className="bg-slate-800 text-sky-300 px-2 py-1 rounded-lg border border-sky-500/30 text-xs font-bold focus:outline-none focus:border-sky-400 w-full max-w-[260px] truncate cursor-pointer hover:bg-slate-750"
                >
                  {graphData?.videos?.map(v => (
                    <option key={`opt-a-${v.id}`} value={v.id} className="bg-slate-900 text-white">
                      {v.is_master ? '🏆 [마스터] ' : ''}#{v.id} {v.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-gray-400 font-mono text-[10px]">
                  재생: {formatTime(seekTimeA)}
                </span>
                <button
                  onClick={() => setActiveDeckSlot('A')}
                  className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold transition-all ${
                    activeDeckSlot === 'A' ? 'bg-sky-500 text-white shadow' : 'bg-slate-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {activeDeckSlot === 'A' ? '● 좌측(A) 활성' : 'A 선택'}
                </button>
              </div>
            </div>

            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-lg relative">
              {videoA && (
                <YouTube
                  key={`deckA-${videoA.id}`}
                  videoId={videoA.youtube_id}
                  className="w-full h-full"
                  opts={playerOpts}
                  onReady={(e) => {
                    setPlayerA(e.target);
                    const startA = calculateLocalSeekTime(videoA, selectedTimeCursor);
                    e.target.seekTo(startA, true);
                    if (!isMuted && activeAudioSource === 'DECK_A') e.target.unMute();
                    else e.target.mute();
                  }}
                />
              )}
            </div>

            <p className="text-[11px] text-gray-300 truncate font-semibold">
              <span className="text-sky-400 font-mono font-bold mr-1">#{videoA?.id}</span> {videoA?.title}
            </p>
          </div>

          {/* Right Deck: Video B with In-Place Calibrator */}
          <div className={`bg-slate-900/95 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2 transition-all border-2 ${
            activeDeckSlot === 'B' ? 'border-twice-magenta ring-2 ring-twice-magenta/40' : 'border-twice-magenta/40'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                <span className="w-5 h-5 rounded-full bg-twice-magenta/20 text-twice-magenta flex items-center justify-center text-[11px] font-mono font-black border border-twice-magenta/30 flex-shrink-0">
                  B
                </span>
                <select
                  value={videoB?.id || ''}
                  onChange={(e) => {
                    const targetId = parseInt(e.target.value, 10);
                    const found = graphData?.videos?.find(v => v.id === targetId);
                    if (found) setVideoB(found);
                  }}
                  className="bg-slate-800 text-twice-magenta px-2 py-1 rounded-lg border border-twice-magenta/30 text-xs font-bold focus:outline-none focus:border-twice-magenta w-full max-w-[260px] truncate cursor-pointer hover:bg-slate-750"
                >
                  {graphData?.videos?.map(v => (
                    <option key={`opt-b-${v.id}`} value={v.id} className="bg-slate-900 text-white">
                      {v.is_master ? '🏆 [마스터] ' : ''}#{v.id} {v.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-twice-apricot font-mono text-[10px]">
                  재생: {formatTime(seekTimeB)}
                </span>
                <button
                  onClick={() => setActiveDeckSlot('B')}
                  className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold transition-all ${
                    activeDeckSlot === 'B' ? 'bg-twice-magenta text-white shadow' : 'bg-slate-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {activeDeckSlot === 'B' ? '● 우측(B) 활성' : 'B 선택'}
                </button>
              </div>
            </div>

            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-lg relative">
              {videoB && (
                <YouTube
                  key={`deckB-${videoB.id}`}
                  videoId={videoB.youtube_id}
                  className="w-full h-full"
                  opts={playerOpts}
                  onReady={(e) => {
                    setPlayerB(e.target);
                    const startB = calculateLocalSeekTime(videoB, selectedTimeCursor, fineTuneDelta);
                    e.target.seekTo(startB, true);
                    if (!isMuted && activeAudioSource === 'DECK_B') e.target.unMute();
                    else e.target.mute();
                  }}
                />
              )}
            </div>

            <p className="text-[11px] text-gray-300 truncate font-semibold">
              <span className="text-twice-magenta font-mono font-bold mr-1">#{videoB?.id}</span> {videoB?.title}
            </p>

            {/* In-Place Target Offset Calibrator Pad */}
            {videoB && !videoB.is_master && (
              <DeckBCalibratorPad
                videoB={videoB}
                fineTuneDelta={fineTuneDelta}
                effectiveOffsetB={effectiveOffsetB}
                isSavingOffset={isSavingOffset}
                saveSuccessMsg={saveSuccessMsg}
                isAiSyncing={isAiSyncing}
                isRoughSyncing={isRoughSyncing}
                isLoadingCalibrator={isLoadingCalibrator}
                onResetFineTune={onResetFineTune}
                onDeltaChange={onDeltaChange}
                onNudge={onNudge}
                onSaveOffset={onSaveOffset}
                onOpenCalibrator={onOpenCalibrator}
                onTriggerRoughSync={onTriggerRoughSync}
                onTriggerAiSync={onTriggerAiSync}
              />
            )}
          </div>
        </div>
      )}

      {/* 4-Cam Multi-View Wall: QUAD */}
      {playerMode === 'QUAD' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {overlappingVideos.slice(0, 4).map((v, idx) => {
            const isSelectedA = videoA?.id === v.id;
            const isSelectedB = videoB?.id === v.id;
            const vSeek = calculateLocalSeekTime(v, selectedTimeCursor);

            return (
              <div
                key={v.id}
                onClick={() => {
                  if (activeDeckSlot === 'A') setVideoA(v);
                  else setVideoB(v);
                }}
                className={`p-2.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                  isSelectedB
                    ? 'bg-slate-900 border-twice-magenta shadow-xl ring-2 ring-twice-magenta/40'
                    : isSelectedA
                    ? 'bg-slate-900 border-sky-400 shadow-xl ring-2 ring-sky-400/40'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="flex items-center gap-1.5 truncate max-w-[240px] text-white">
                    <span className="w-4 h-4 rounded-full bg-slate-800 text-twice-apricot flex items-center justify-center text-[9px] font-mono">
                      {idx + 1}
                    </span>
                    <span className="text-purple-400 font-mono font-bold">#{v.id}</span>
                    <span className="truncate">{v.title}</span>
                  </span>
                  <span className="text-gray-400 font-mono text-[9px]">
                    {formatTime(vSeek)}
                  </span>
                </div>

                <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800">
                  <iframe
                    key={`quad-${v.id}-${vSeek}`}
                    src={`https://www.youtube.com/embed/${v.youtube_id}?start=${vSeek}&autoplay=1&mute=${!isMuted && ((activeAudioSource === 'DECK_B' && isSelectedB) || (activeAudioSource === 'DECK_A' && isSelectedA)) ? '0' : '1'}`}
                    title={v.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                <p className="text-[10px] text-gray-400 truncate">
                  {v.members && v.members.length > 0 && (
                    <span className="text-twice-apricot mr-1.5 font-semibold">[{v.members.join(', ')}]</span>
                  )}
                  {v.title}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Cinema Player: SINGLE */}
      {playerMode === 'SINGLE' && (videoB || videoA) && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-3">
          {(() => {
            const target = videoB || videoA!;
            const tSeek = calculateLocalSeekTime(target, selectedTimeCursor);
            return (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white line-clamp-1">
                    <span className="text-twice-magenta font-mono font-bold mr-1.5">#{target.id}</span>
                    {target.title}
                  </h3>
                  <Link
                    to={`/video/${target.id}?t=${tSeek}`}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg flex items-center gap-1 text-xs"
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> 360° 멀티뷰
                  </Link>
                </div>

                <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
                  <iframe
                    key={`single-${target.id}-${tSeek}`}
                    src={`https://www.youtube.com/embed/${target.youtube_id}?start=${tSeek}&autoplay=1`}
                    title={target.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </>
            );
          })()}
        </div>
      )}
    </>
  );
};
