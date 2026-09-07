import React from 'react';
import { Columns, LayoutGrid, Square, ArrowLeftRight } from 'lucide-react';

interface DeckStudioHeaderProps {
  playerMode: 'DUAL' | 'QUAD' | 'SINGLE';
  activeDeckSlot: 'A' | 'B';
  activeAudioSource: string;
  selectedTimeCursor: number;
  formatTime: (sec: number) => string;
  onSetPlayerMode: (mode: 'DUAL' | 'QUAD' | 'SINGLE') => void;
  onSetActiveDeckSlot: (slot: 'A' | 'B') => void;
  onSwapDecks: () => void;
  onSetActiveAudioSource: (source: string) => void;
}

export const DeckStudioHeader: React.FC<DeckStudioHeaderProps> = ({
  playerMode,
  activeDeckSlot,
  activeAudioSource,
  selectedTimeCursor,
  formatTime,
  onSetPlayerMode,
  onSetActiveDeckSlot,
  onSwapDecks,
  onSetActiveAudioSource
}) => {
  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
      {/* Left Group: Mode Switcher & Deck Slot Target Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold">
          <button
            onClick={() => onSetPlayerMode('DUAL')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              playerMode === 'DUAL'
                ? 'bg-twice-magenta text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            title="자유 2개 영상 1:1 비교 & 캘리브레이션"
          >
            <Columns className="w-3.5 h-3.5" /> 2-Cam 듀얼 싱크
          </button>
          <button
            onClick={() => onSetPlayerMode('QUAD')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              playerMode === 'QUAD'
                ? 'bg-twice-magenta text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            title="동시 촬영된 최대 4개 앵글 동시 재생 벽"
          >
            <LayoutGrid className="w-3.5 h-3.5" /> 4-Cam 멀티뷰 벽
          </button>
          <button
            onClick={() => onSetPlayerMode('SINGLE')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              playerMode === 'SINGLE'
                ? 'bg-twice-magenta text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
            title="선택된 영상 단독 풀스크린 뷰"
          >
            <Square className="w-3.5 h-3.5" /> 단독 포커스
          </button>
        </div>

        {/* Deck Target Selector */}
        {playerMode === 'DUAL' && (
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <span className="text-gray-500 text-[10px] px-1.5 font-mono">클릭 대상:</span>
            <button
              onClick={() => onSetActiveDeckSlot('A')}
              className={`px-2 py-1 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                activeDeckSlot === 'A'
                  ? 'bg-sky-500 text-white shadow'
                  : 'text-gray-400 hover:text-sky-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-sky-300" /> Deck A (좌측)
            </button>
            <button
              onClick={() => onSetActiveDeckSlot('B')}
              className={`px-2 py-1 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                activeDeckSlot === 'B'
                  ? 'bg-twice-magenta text-white shadow'
                  : 'text-gray-400 hover:text-pink-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-twice-apricot" /> Deck B (우측)
            </button>
            <button
              onClick={onSwapDecks}
              className="p-1 hover:bg-slate-800 text-gray-300 hover:text-white rounded transition-all ml-0.5"
              title="Deck A ↔ B 좌우 영상 맞바꾸기"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Right Group: Audio & Time Indicator */}
      <div className="flex items-center gap-3 text-xs font-mono">
        <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700">
          <span className="text-gray-400 text-[11px]">오디오 출력:</span>
          <select
            value={activeAudioSource === 'DECK_A' ? 'DECK_A' : 'DECK_B'}
            onChange={(e) => onSetActiveAudioSource(e.target.value)}
            className="bg-transparent text-[11px] font-bold focus:outline-none cursor-pointer text-twice-apricot"
          >
            <option value="DECK_B" className="bg-slate-900 text-white">Deck B (우측) 단일 소리</option>
            <option value="DECK_A" className="bg-slate-900 text-white">Deck A (좌측) 단일 소리</option>
          </select>
        </div>

        <div className="bg-twice-magenta/10 border border-twice-magenta/30 px-3 py-1.5 rounded-xl text-twice-magenta font-black">
          ⏱️ {formatTime(selectedTimeCursor)}
        </div>
      </div>
    </div>
  );
};
