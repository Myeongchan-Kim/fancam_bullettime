import React from 'react';
import { Song } from '../types';

interface SetlistSliderProps {
  songs: Song[];
  startOrder: number;
  endOrder: number;
  onChange: (start: number, end: number) => void;
}

const SetlistSlider: React.FC<SetlistSliderProps> = ({ songs, startOrder, endOrder, onChange }) => {
  // Defensive calculation of min/max orders
  const validSongs = songs.filter(s => typeof s.order === 'number');
  const minOrder = validSongs.length > 0 ? Math.min(...validSongs.map(s => s.order)) : 1;
  const maxOrder = validSongs.length > 0 ? Math.max(...validSongs.map(s => s.order)) : 37; // Fallback to 37 (standard tour size)
  
  if (songs.length === 0) return (
    <div className="w-full bg-slate-900/60 border-y border-slate-800/50 backdrop-blur-md p-8 text-center text-gray-600 italic">
      Initializing timeline...
    </div>
  );

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    const value = Math.min(val, endOrder);
    onChange(value, endOrder);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    const value = Math.max(val, startOrder);
    onChange(startOrder, value);
  };

  const getSongName = (order: number) => {
    const song = songs.find(s => s.order === order);
    return song ? song.name : `Track ${order}`;
  };

  const calculatePercent = (order: number) => {
    if (maxOrder === minOrder) return 0;
    return ((order - minOrder) / (maxOrder - minOrder)) * 100;
  };

  return (
    <div className="w-full bg-slate-900/60 border-y border-slate-800/50 backdrop-blur-md p-8 relative overflow-hidden group">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header Labeling */}
        <div className="flex justify-between items-end border-b border-white/5 pb-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-twice-magenta drop-shadow-[0_0_5px_#FF1988]">Timeline Range</span>
            <h3 className="text-2xl font-black text-white tracking-tighter italic uppercase flex items-center gap-4">
              {startOrder === endOrder ? (
                <span>#{startOrder.toString().padStart(2, '0')} {getSongName(startOrder)}</span>
              ) : (
                <>
                  <span className="text-twice-apricot">#{startOrder.toString().padStart(2, '0')}</span>
                  <span className="text-gray-600 text-sm normal-case not-italic tracking-normal font-bold px-2">TO</span>
                  <span className="text-twice-apricot">#{endOrder.toString().padStart(2, '0')}</span>
                </>
              )}
            </h3>
          </div>
          <div className="text-right bg-slate-800/50 px-4 py-2 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Selected Window</span>
            <p className="text-sm text-white font-black">{endOrder - startOrder + 1} TRACKS</p>
          </div>
        </div>

        {/* The Slider Component */}
        <div className="relative h-14 flex items-center px-2">
          {/* Base Track */}
          <div className="absolute w-full h-2 bg-slate-950 rounded-full border border-white/5"></div>
          
          {/* Active Segment Highlight */}
          <div 
            className="absolute h-2 bg-twice-magenta shadow-[0_0_20px_#FF1988] rounded-full z-10 transition-all duration-300"
            style={{ 
              left: `${calculatePercent(startOrder)}%`, 
              width: `${calculatePercent(endOrder) - calculatePercent(startOrder)}%` 
            }}
          ></div>

          {/* Dual Input Overlays */}
          <input
            type="range" 
            min={minOrder} 
            max={maxOrder} 
            step="1"
            value={startOrder} 
            onChange={handleStartChange}
            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none z-30 cursor-pointer accent-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-twice-magenta [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
          />
          <input
            type="range" 
            min={minOrder} 
            max={maxOrder} 
            step="1"
            value={endOrder} 
            onChange={handleEndChange}
            className="absolute w-full h-2 appearance-none bg-transparent pointer-events-none z-30 cursor-pointer accent-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-twice-magenta [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
          />

          {/* Scale Ticks */}
          <div className="absolute w-full h-full flex justify-between px-1 pointer-events-none pt-8">
            {songs.map((song) => (
              song.order % 5 === 0 && (
                <div key={song.id} className="flex flex-col items-center" style={{ position: 'absolute', left: `${calculatePercent(song.order)}%`, transform: 'translateX(-50%)' }}>
                  <div className="w-px h-3 bg-slate-700"></div>
                  <span className="text-[8px] font-black text-gray-600 mt-1">{song.order}</span>
                </div>
              )
            ))}
          </div>
        </div>

        {/* Footer Labels */}
        <div className="grid grid-cols-2 gap-10 pt-4">
          <div className="space-y-1 group/start overflow-hidden">
            <span className="text-[9px] font-black text-twice-magenta/50 uppercase tracking-widest block group-hover/start:text-twice-magenta transition-colors text-left">Start Track Name</span>
            <div className="text-xs text-white font-bold truncate border-l-2 border-twice-magenta pl-3 bg-white/5 py-2 rounded-r-lg text-left">
              {getSongName(startOrder)}
            </div>
          </div>
          <div className="space-y-1 group/end text-right overflow-hidden">
            <span className="text-[9px] font-black text-twice-magenta/50 uppercase tracking-widest block group-hover/end:text-twice-magenta transition-colors text-right">End Track Name</span>
            <div className="text-xs text-white font-bold truncate border-r-2 border-twice-magenta pr-3 bg-white/5 py-2 rounded-l-lg text-right">
              {getSongName(endOrder)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetlistSlider;
