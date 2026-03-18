import React from 'react';
import { Music, ArrowRight } from 'lucide-react';
import { Song } from '../types';

interface SetlistBarProps {
  songs: Song[];
  selectedSongId: string;
  onSongSelect: (id: string) => void;
}

const SetlistBar: React.FC<SetlistBarProps> = ({ songs, selectedSongId, onSongSelect }) => {
  const selectedIndex = songs.findIndex(s => s.id.toString() === selectedSongId);

  return (
    <div className="w-full bg-slate-900/40 border-y border-slate-800/50 backdrop-blur-md relative overflow-hidden group">
      {/* Timeline Background Track */}
      <div className="absolute top-0 left-0 w-full h-1 bg-slate-800"></div>
      
      {/* Progress Segment Indicator */}
      {selectedIndex !== -1 && (
        <div 
          className="absolute top-0 left-0 h-1 bg-twice-magenta shadow-[0_0_10px_#FF1988] transition-all duration-700 ease-out"
          style={{ width: `${((selectedIndex + 1) / songs.length) * 100}%` }}
        ></div>
      )}

      <div className="max-w-[95rem] mx-auto flex items-center px-8 py-6">
        <div className="flex-shrink-0 flex items-center gap-3 pr-6 border-r border-slate-800">
          <div className="p-2 bg-twice-magenta/10 rounded-lg">
            <Music className="w-5 h-5 text-twice-magenta" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Tour Setlist</span>
            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter italic">Timeline Flow</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-3 px-6 py-1 scroll-smooth">
          {songs.map((song, index) => {
            const isSelected = selectedSongId === song.id.toString();
            const isPast = selectedIndex !== -1 && index < selectedIndex;
            
            return (
              <React.Fragment key={song.id}>
                <button
                  onClick={() => onSongSelect(isSelected ? '' : song.id.toString())}
                  className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[10px] font-bold transition-all border group/btn relative ${
                    isSelected 
                      ? 'bg-twice-magenta border-twice-magenta text-white shadow-[0_0_20px_#FF1988] scale-110 z-10' 
                      : isPast
                        ? 'bg-slate-800/40 border-twice-magenta/30 text-twice-magenta/70'
                        : 'bg-slate-900/60 border-slate-800 text-gray-500 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  <div className="flex flex-col items-start gap-0.5">
                    <span className={`text-[7px] font-black tracking-widest opacity-40 uppercase`}>Track {index + 1}</span>
                    <span className="whitespace-nowrap uppercase tracking-tight">{song.name}</span>
                  </div>
                  
                  {isSelected && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_white]"></div>
                  )}
                </button>
                
                {index < songs.length - 1 && (
                  <ArrowRight className={`w-3 h-3 flex-shrink-0 transition-colors ${isPast ? 'text-twice-magenta/30' : 'text-slate-800'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SetlistBar;
