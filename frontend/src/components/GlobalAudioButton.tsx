import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useGlobalAudio } from '../context/AudioContext';

interface GlobalAudioButtonProps {
  className?: string;
  showLabel?: boolean;
}

export const GlobalAudioButton: React.FC<GlobalAudioButtonProps> = ({ 
  className = '', 
  showLabel = true 
}) => {
  const { isMuted, toggleGlobalMute, activeAudioSource } = useGlobalAudio();

  return (
    <button
      onClick={toggleGlobalMute}
      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all duration-200 border shadow-md active:scale-95 ${
        isMuted
          ? 'bg-slate-800/90 text-gray-400 border-slate-700 hover:text-white hover:bg-slate-750'
          : 'bg-twice-magenta/20 text-twice-magenta border-twice-magenta/40 hover:bg-twice-magenta/30 shadow-[0_0_12px_rgba(255,25,136,0.25)]'
      } ${className}`}
      title={isMuted ? "전체 음소거 해제 (오디오 1개 켜기)" : "전체 음소거 (모든 오디오 끄기)"}
    >
      {isMuted ? (
        <>
          <VolumeX className="w-4 h-4 text-gray-400" />
          {showLabel && <span>전체 MUTE</span>}
        </>
      ) : (
        <>
          <Volume2 className="w-4 h-4 text-twice-magenta animate-pulse" />
          {showLabel && (
            <span className="flex items-center gap-1">
              <span>오디오 ON</span>
              <span className="text-[10px] font-mono text-twice-apricot opacity-90">({activeAudioSource})</span>
            </span>
          )}
        </>
      )}
    </button>
  );
};
