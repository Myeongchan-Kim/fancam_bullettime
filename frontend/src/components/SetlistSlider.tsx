import React from 'react';
import { Song, Concert } from '../types';
import { MapPin } from 'lucide-react';

interface SetlistSliderProps {
  songs: Song[];
  concerts: Concert[];
  selectedConcert: string;
  onConcertChange: (val: string) => void;
  startOrder: number;
  endOrder: number;
  onChange: (start: number, end: number) => void;
}

const SetlistSlider: React.FC<SetlistSliderProps> = ({ 
  songs, 
  concerts, 
  selectedConcert, 
  onConcertChange, 
  startOrder, 
  endOrder, 
  onChange 
}) => {
  const validSongs = songs.filter((s): s is Song & { order: number } => typeof s.order === 'number');
  const minOrder = validSongs.length > 0 ? Math.min(...validSongs.map(s => s.order)) : 1;
  const actualMaxOrder = validSongs.length > 0 ? Math.max(...validSongs.map(s => s.order)) : 37;
  const maxOrder = actualMaxOrder + 1;

  const displaySongs: (Song & { order: number })[] = [
    ...validSongs,
    { id: -1, name: "No song tag", order: maxOrder, is_solo: false } as Song & { order: number }
  ];
  
  if (songs.length === 0) return (
    <div className="w-full bg-slate-900/60 border-y border-slate-800/50 backdrop-blur-md p-8 text-center text-gray-600 italic">
      Initializing timeline...
    </div>
  );

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    onChange(Math.min(val, endOrder), endOrder);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    onChange(startOrder, Math.max(val, startOrder));
  };

  const getSongName = (order: number) => {
    if (order === maxOrder) return "No song tag";
    return songs.find(s => s.order === order)?.name || `Track ${order}`;
  };

  const calculatePercent = (order: number) => {
    if (maxOrder === minOrder) return 0;
    return ((order - minOrder) / (maxOrder - minOrder)) * 100;
  };

  // Reorder Concerts: Past (DESC) -> Other -> Upcoming (ASC)
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const pastConcerts = concerts
    .filter(c => c.city !== 'Other' && c.date && new Date(c.date) <= now)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
  const futureConcerts = concerts
    .filter(c => c.city !== 'Other' && c.date && new Date(c.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const otherConcert = concerts.find(c => c.city === 'Other');

  return (
    <div className="w-full bg-slate-900/60 border-y border-slate-800/50 backdrop-blur-md p-8 relative overflow-hidden group">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header Section */}
        <div className="flex justify-between items-end border-b border-white/5 pb-4">
          <div className="flex gap-12 items-end">
            {/* Venue & City Integrated Filter */}
            <div className="space-y-1 min-w-[200px]">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-twice-apricot drop-shadow-[0_0_5px_rgba(255,179,92,0.4)] flex items-center gap-2">
                <MapPin className="h-3 w-3" /> Venue & City
              </span>
              <div className="relative group/select">
                <select 
                  className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer text-white font-black italic uppercase tracking-tighter"
                  value={selectedConcert}
                  onChange={(e) => onConcertChange(e.target.value)}
                >
                  <option value="">ALL CONCERTS</option>
                  
                  {/* Past Concerts */}
                  {pastConcerts.map(c => (
                    <option key={c.id} value={c.id} className="bg-slate-900 font-bold">
                      {c.city.toUpperCase()} - {new Date(c.date).toLocaleDateString()}
                    </option>
                  ))}

                  {/* Other / Vlogs */}
                  {otherConcert && (
                    <option value={otherConcert.id} className="bg-slate-900 text-twice-apricot font-black">
                      OTHER CONTENT / VLOGS
                    </option>
                  )}

                  {/* Upcoming Separator & List */}
                  {futureConcerts.length > 0 && (
                    <>
                      <option disabled className="bg-slate-950 text-gray-600 text-center">────────── UPCOMING ──────────</option>
                      {futureConcerts.map(c => (
                        <option key={c.id} value={c.id} className="bg-slate-900 opacity-50 italic">
                          {c.city.toUpperCase()} - {new Date(c.date).toLocaleDateString()}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover/select:text-twice-magenta transition-colors">
                  <div className="w-1.5 h-1.5 border-r-2 border-b-2 border-current rotate-45"></div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-twice-magenta drop-shadow-[0_0_5px_#FF1988]">Timeline Range</span>
              <h3 className="text-2xl font-black text-white tracking-tighter italic uppercase flex items-center gap-4 text-white">
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
          </div>
          
          <div className="text-right bg-slate-800/50 px-4 py-2 rounded-2xl border border-white/5">
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block text-white">Selected Window</span>
            <p className="text-sm text-white font-black">{endOrder - startOrder + 1} TRACKS</p>
          </div>
        </div>

        {/* Slider Component */}
        <div className="relative h-36 flex items-start mt-4">
          {/* Base Track - Centered between thumb centers */}
          <div className="absolute left-[10px] right-[10px] h-1.5 bg-slate-950 rounded-full border border-white/5 top-3"></div>
          
          {/* Active Range Highlight - Precisely positioned */}
          <div 
            className="absolute h-1.5 bg-twice-magenta shadow-[0_0_20px_#FF1988] rounded-full z-10 transition-all duration-300 top-3 pointer-events-none"
            style={{ 
              left: `calc(10px + ${calculatePercent(startOrder)} * (100% - 20px) / 100)`, 
              width: `calc((${calculatePercent(endOrder)} - ${calculatePercent(startOrder)}) * (100% - 20px) / 100)` 
            }}
          ></div>

          {/* Dual Inputs */}
          <input
            type="range" min={minOrder} max={maxOrder} step="1" value={startOrder} onChange={handleStartChange}
            className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none z-30 cursor-pointer top-3 accent-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-twice-magenta [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
          />
          <input
            type="range" min={minOrder} max={maxOrder} step="1" value={endOrder} onChange={handleEndChange}
            className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none z-30 cursor-pointer top-3 accent-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-twice-magenta [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
          />

          {/* Ticker Labels Area - Matches thumb track exactly */}
          <div className="absolute left-[10px] right-[10px] top-3 bottom-0 pointer-events-none">
            {displaySongs.map((song) => {
              const isActive = song.order >= startOrder && song.order <= endOrder;
              const isMajor = song.order % 5 === 0 || song.order === 1 || song.order === maxOrder;
              
              return (
                <div 
                  key={song.id} 
                  className="absolute top-0 h-full transition-all duration-500" 
                  style={{ left: `${calculatePercent(song.order)}%` }}
                >
                  <div className={`w-px mx-auto transition-all duration-500 ${
                    isActive ? 'h-6 bg-twice-magenta shadow-[0_0_8px_#FF1988]' : isMajor ? 'h-4 bg-slate-700' : 'h-2 bg-slate-800'
                  }`}></div>
                  
                  <div 
                    className={`absolute top-8 left-0 origin-top-left rotate-45 transition-all duration-500 whitespace-nowrap ${
                      isActive 
                        ? 'text-white text-[9px] font-black opacity-100 scale-105' 
                        : isMajor 
                          ? 'text-gray-500 text-[8px] font-bold opacity-60' 
                          : 'text-gray-700 text-[7px] font-medium opacity-30'
                    }`}
                    style={{ textShadow: isActive ? '0 0 10px rgba(255, 25, 136, 0.4)' : 'none' }}
                  >
                    <span className="mr-2 opacity-40 font-mono">#{song.order.toString().padStart(2, '0')}</span>
                    {song.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Info Area */}
        <div className="grid grid-cols-2 gap-10 pt-8 border-t border-white/5">
          <div className="space-y-1">
            <span className="text-[9px] font-black text-twice-magenta/50 uppercase tracking-widest block text-white">Start Track</span>
            <div className="text-xs text-white font-bold truncate border-l-2 border-twice-magenta pl-3 bg-white/5 py-2 rounded-r-lg text-white">
              {getSongName(startOrder)}
            </div>
          </div>
          <div className="space-y-1 text-right">
            <span className="text-[9px] font-black text-twice-magenta/50 uppercase tracking-widest block text-white text-right">End Track</span>
            <div className="text-xs text-white font-bold truncate border-r-2 border-twice-magenta pr-3 bg-white/5 py-2 rounded-l-lg text-white text-right">
              {getSongName(endOrder)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetlistSlider;
