import React, { createContext, useContext, useState } from 'react';

export interface GlobalAudioContextType {
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  toggleGlobalMute: () => void;
  // Current active audio source slot: 'DECK_A', 'DECK_B', 'MASTER', etc.
  activeAudioSource: string;
  setActiveAudioSource: (source: string) => void;
}

const GlobalAudioContext = createContext<GlobalAudioContextType | undefined>(undefined);

export const GlobalAudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Global mute setting: default to true for browser autoplay policies
  const [isMuted, setIsMutedState] = useState<boolean>(() => {
    const saved = localStorage.getItem('global_audio_muted');
    return saved !== null ? saved === 'true' : true;
  });

  // Track the single target that is permitted to output sound when isMuted is false
  const [activeAudioSource, setActiveAudioSourceState] = useState<string>(() => {
    return localStorage.getItem('global_active_audio_source') || 'DECK_B';
  });

  const setIsMuted = (muted: boolean) => {
    setIsMutedState(muted);
    localStorage.setItem('global_audio_muted', muted.toString());
  };

  const toggleGlobalMute = () => {
    setIsMutedState(prev => {
      const next = !prev;
      localStorage.setItem('global_audio_muted', next.toString());
      return next;
    });
  };

  const setActiveAudioSource = (source: string) => {
    setActiveAudioSourceState(source);
    localStorage.setItem('global_active_audio_source', source);
  };

  return (
    <GlobalAudioContext.Provider
      value={{
        isMuted,
        setIsMuted,
        toggleGlobalMute,
        activeAudioSource,
        setActiveAudioSource,
      }}
    >
      {children}
    </GlobalAudioContext.Provider>
  );
};

export const useGlobalAudio = (): GlobalAudioContextType => {
  const context = useContext(GlobalAudioContext);
  if (!context) {
    throw new Error('useGlobalAudio must be used within a GlobalAudioProvider');
  }
  return context;
};
