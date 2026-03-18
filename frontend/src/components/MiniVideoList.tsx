import React from 'react';
import { Video } from '../types';

interface MiniVideoListProps {
  title: string;
  videos: Video[];
  onPlay: (v: Video) => void;
}

const MiniVideoList: React.FC<MiniVideoListProps> = ({ title, videos, onPlay }) => (
  <div className="hidden xl:flex flex-col w-64 space-y-4 z-20 self-start mt-10">
    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 border-b border-slate-800 pb-3 ml-2 flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-twice-magenta animate-pulse shadow-[0_0_10px_#FF1988]"></div>
      {title}
    </h3>
    <div className="space-y-4 overflow-y-auto max-h-[35rem] pr-2 custom-scrollbar">
      {videos.map(v => (
        <div 
          key={v.id} 
          onClick={() => onPlay(v)}
          className="group flex items-center gap-4 p-2 rounded-2xl bg-slate-800/20 border border-transparent hover:border-slate-700 hover:bg-slate-800/50 transition-all cursor-pointer"
        >
          <div className="w-20 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-black shadow-lg">
            <img src={v.thumbnail_url} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" alt="" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-white truncate group-hover:text-twice-apricot transition-colors">{v.title}</p>
            <p className="text-[8px] text-gray-500 font-black uppercase tracking-tighter truncate opacity-60 italic">{v.song?.name || 'Fancam'}</p>
          </div>
        </div>
      ))}
      {videos.length === 0 && <p className="text-[9px] text-gray-700 italic ml-4">Waiting for data...</p>}
    </div>
  </div>
);

export default MiniVideoList;
