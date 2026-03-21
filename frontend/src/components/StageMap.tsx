import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ExternalLink, Target } from 'lucide-react';
import { Video } from '../types';

interface StageMapProps {
  // Common
  angle: string;
  
  // For Marker Display (HomePage)
  videos?: Video[];
  onPlayVideo?: (v: Video) => void;
  
  // For Precise Pining (VideoDetail)
  x?: number | null;
  y?: number | null;
  onPosSelect?: (x: number, y: number) => void;
  previewX?: number | null;
  previewY?: number | null;
  
  // Style
  sizeClass?: string; // e.g. "w-[45rem]"
  stageScale?: number; // e.g. 1.1
}

const StageMap: React.FC<StageMapProps> = ({ 
  angle, 
  videos = [], 
  onPlayVideo,
  x = null,
  y = null,
  onPosSelect,
  previewX = null,
  previewY = null,
  sizeClass = "w-full",
  stageScale = 1.1
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);

  const mainAngles = [
    { label: "North (Front)", rotation: 0 },
    { label: "East (Right)", rotation: 90 },
    { label: "South (Back)", rotation: 180 },
    { label: "West (Left)", rotation: 270 }
  ];

  const getLineHighlight = (target: string) => 
    angle === target ? "bg-twice-magenta h-16 shadow-[0_0_25px_#FF1988] w-1.5" : "bg-slate-700 h-10 w-1 opacity-50";

  const handleMapClick = (e: React.MouseEvent) => {
    if (onPosSelect && mapRef.current) {
      const rect = mapRef.current.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;
      onPosSelect(clickX, clickY);
    } else {
      setActiveTooltip(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full transition-all overflow-visible">
      <div 
        ref={mapRef}
        onClick={handleMapClick}
        className={`relative aspect-square flex items-center justify-center overflow-visible ${sizeClass} ${onPosSelect ? 'cursor-crosshair hover:bg-slate-700/20 transition-colors rounded-full' : ''}`}
      >
        {/* Dial Background */}
        <div className="absolute inset-0 rounded-full border-4 border-slate-900 shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] scale-110 bg-slate-900/10 pointer-events-none"></div>
        
        {/* Dial Ticks */}
        {[...Array(72)].map((_, i) => (
          <div key={i} className="absolute w-1 h-full flex flex-col justify-between py-1 pointer-events-none" style={{ transform: `rotate(${i * 5}deg)` }}>
            <div className={`w-0.5 ${i % 6 === 0 ? 'h-6 bg-slate-700' : 'h-4 bg-slate-800'} mx-auto opacity-50`}></div>
            <div className={`w-0.5 ${i % 6 === 0 ? 'h-6 bg-slate-700' : 'h-3 bg-slate-800'} mx-auto opacity-50`}></div>
          </div>
        ))}

        {/* Main Directions (N,S,E,W Indicators) */}
        {mainAngles.map((a) => (
          <div key={a.label} className="absolute inset-0 flex justify-center py-1 pointer-events-none" style={{ transform: `rotate(${a.rotation}deg)` }}>
            <div className={`rounded-full transition-all duration-300 ${getLineHighlight(a.label)}`}></div>
          </div>
        ))}

        {/* Official Target Marker */}
        {x !== null && y !== null && (
          <div 
            className="absolute z-40 pointer-events-none opacity-60"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            <div className="w-5 h-5 bg-slate-400 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20 shadow-lg">
              <Target className="w-3 h-3 text-white" />
            </div>
          </div>
        )}

        {/* Suggestion/Preview Marker */}
        {previewX !== null && previewY !== null && (
           <div 
            className="absolute z-50 pointer-events-none"
            style={{ left: `${previewX * 100}%`, top: `${previewY * 100}%` }}
          >
            <div className="w-6 h-6 bg-twice-magenta rounded-full shadow-[0_0_20px_#FF1988] flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20 animate-bounce text-white">
              <Target className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Current Working Target Marker */}
        {previewX === null && x !== null && y !== null && (
          <div 
            className="absolute z-50 pointer-events-none"
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          >
            <div className="w-6 h-6 bg-twice-magenta rounded-full shadow-[0_0_20px_#FF1988] flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20 text-white">
              <Target className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Home Page Video Markers */}
        {videos.map((v) => {
          if (v.coordinate_x !== null && v.coordinate_y !== null) {
            const isOpen = activeTooltip === v.id;
            return (
              <div 
                key={`marker-${v.id}`}
                className="absolute z-50 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${v.coordinate_x * 100}%`, top: `${v.coordinate_y * 100}%` }}
                onClick={(e) => { e.stopPropagation(); setActiveTooltip(isOpen ? null : v.id); }}
              >
                <div className={`w-5 h-5 bg-twice-magenta rounded-full shadow-[0_0_15px_#FF1988] border-2 border-white/20 animate-pulse cursor-pointer hover:scale-125 transition-transform ${isOpen ? 'scale-125 ring-4 ring-twice-magenta/30' : ''}`}></div>
                
                {isOpen && onPlayVideo && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 animate-in zoom-in-95 duration-200 bg-slate-900 border border-slate-700 w-64 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[60]" onClick={(e) => e.stopPropagation()}>
                    <div className="relative aspect-video w-full group/thumb cursor-pointer overflow-hidden" onClick={() => onPlayVideo(v)}>
                      <img src={v.thumbnail_url} className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110" alt="" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                        <Play className="h-12 w-12 text-white fill-white shadow-2xl" />
                      </div>
                    </div>
                    <div className="p-4 space-y-4 text-left">
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold text-white line-clamp-2 leading-tight">{v.title}</h4>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight italic opacity-70">{v.songs && v.songs.length > 0 ? v.songs.map(s => s.name).join(', ') : 'Unknown Song'} • {v.concert?.city}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { onPlayVideo(v); setActiveTooltip(null); }} className="flex-1 bg-twice-magenta hover:bg-twice-magenta/90 text-white text-[10px] font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-twice-magenta/20">
                          <Play className="h-3 w-3 fill-current" /> PLAY
                        </button>
                        <button onClick={() => navigate(`/video/${v.id}`)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-700">
                          <ExternalLink className="h-3 w-3" /> DETAIL
                        </button>
                      </div>
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-slate-700"></div>
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {/* Integrated Stage with Precise PIT Layout - Adjusted Width */}
        <div className="relative w-[32rem] h-32 flex items-center justify-center z-10 pointer-events-none text-white shrink-0" style={{ transform: `scale(${stageScale})` }}>
          {/* Main Huge Stage Body */}
          <div className="absolute w-full h-full bg-slate-700/80 rounded-lg shadow-2xl flex items-center justify-center border-2 border-slate-600/50 overflow-hidden">
            <span className="text-[12px] font-black tracking-[1.5em] uppercase opacity-30">Stage</span>
          </div>
          
          {/* PIT 2 (Top Right Cutout) */}
          <div className="absolute top-0 right-12 w-32 h-20 bg-[#0f172a] border-2 border-slate-700 rounded-bl-2xl flex items-center justify-center text-[9px] text-gray-500 font-bold tracking-widest z-20 shadow-inner">
            PIT 2
          </div>
          
          {/* PIT 1 (Bottom Left Cutout) */}
          <div className="absolute bottom-0 left-12 w-32 h-20 bg-[#0f172a] border-2 border-slate-700 rounded-tr-2xl flex items-center justify-center text-[9px] text-gray-500 font-bold tracking-widest z-20 shadow-inner">
            PIT 1
          </div>
        </div>
      </div>
    </div>
  );
};

export default StageMap;
