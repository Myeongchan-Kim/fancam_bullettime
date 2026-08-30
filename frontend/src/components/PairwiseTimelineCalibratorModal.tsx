import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import YouTube, { YouTubePlayer } from 'react-youtube';
import axios from 'axios';
import { 
  X, Play, Pause, RotateCcw, Save, Check, 
  Sliders, ShieldCheck, Layers, Filter
} from 'lucide-react';
import { Video } from '../types';
import { API_BASE_URL } from '../constants';

interface PairwiseTimelineCalibratorModalProps {
  currentVideo: Video;
  allConcertVideos: Video[];
  onClose: () => void;
  onSaved: (updatedVideoId: number, newOffset: number) => void;
  adminKey?: string;
}

const MEMBER_COLORS: { [key: string]: { bg: string; text: string; border: string; bar: string } } = {
  Nayeon: { bg: 'bg-sky-500/20', text: 'text-sky-300', border: 'border-sky-500/40', bar: 'bg-sky-500' },
  Jeongyeon: { bg: 'bg-lime-500/20', text: 'text-lime-300', border: 'border-lime-500/40', bar: 'bg-lime-500' },
  Momo: { bg: 'bg-pink-400/20', text: 'text-pink-300', border: 'border-pink-400/40', bar: 'bg-pink-400' },
  Sana: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40', bar: 'bg-purple-500' },
  Jihyo: { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40', bar: 'bg-amber-500' },
  Mina: { bg: 'bg-emerald-400/20', text: 'text-emerald-300', border: 'border-emerald-400/40', bar: 'bg-emerald-400' },
  Dahyun: { bg: 'bg-slate-300/20', text: 'text-slate-200', border: 'border-slate-300/40', bar: 'bg-slate-300' },
  Chaeyoung: { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/40', bar: 'bg-red-500' },
  Tzuyu: { bg: 'bg-blue-600/20', text: 'text-blue-300', border: 'border-blue-500/40', bar: 'bg-blue-600' },
};

export const PairwiseTimelineCalibratorModal: React.FC<PairwiseTimelineCalibratorModalProps> = ({
  currentVideo,
  allConcertVideos,
  onClose,
  onSaved,
  adminKey = localStorage.getItem('admin_key') || ''
}) => {
  // Video A: Anchor (Fixed Reference)
  const [anchorVideo] = useState<Video>(currentVideo);
  
  // Video B: Target video to calibrate against Anchor
  const [targetVideo, setTargetVideo] = useState<Video | null>(null);

  // Filter Mode: 'FANCAMS' (3~5min single fancams) vs 'ALL' (including full concerts)
  const [filterMode, setFilterMode] = useState<'FANCAMS' | 'ALL'>('FANCAMS');

  // Delta offset applied to Target Video (Target Offset = Anchor Offset + Delta or Base + Delta)
  const [targetOffset, setTargetOffset] = useState<number>(0);
  const [initialTargetOffset, setInitialTargetOffset] = useState<number>(0);

  // Dual Player States
  const [playerA, setPlayerA] = useState<YouTubePlayer | null>(null);
  const [playerB, setPlayerB] = useState<YouTubePlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioMode, setAudioMode] = useState<'A' | 'B' | 'BOTH' | 'MUTE'>('A');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Anchor window
  const anchorStart = anchorVideo.sync_offset || 0;
  const anchorDur = (anchorVideo.duration && anchorVideo.duration > 0) ? anchorVideo.duration : 220;
  const anchorEnd = anchorStart + anchorDur;

  // Separate fancams vs full concerts/long streams
  const { sameSongFancams, longBridgeVideos, allOverlapping } = useMemo(() => {
    const overlapping = allConcertVideos.filter(v => {
      if (v.id === anchorVideo.id) return false;
      const vStart = v.sync_offset || 0;
      const vDur = (v.duration && v.duration > 0) ? v.duration : 220;
      const vEnd = vStart + vDur;
      // Overlap with 30s padding
      return !(anchorEnd < vStart - 30 || anchorStart > vEnd + 30);
    });

    const fancams: Video[] = [];
    const fullConcerts: Video[] = [];

    overlapping.forEach(v => {
      const dur = v.duration || 0;
      const isLong = dur > 600 || (v.title && v.title.toLowerCase().includes('full concert')) || v.angle === 'Full-Concert';
      if (isLong) {
        fullConcerts.push(v);
      } else {
        fancams.push(v);
      }
    });

    // Sort fancams by closest duration and start offset
    fancams.sort((a, b) => {
      const diffA = Math.abs((a.duration || 220) - anchorDur);
      const diffB = Math.abs((b.duration || 220) - anchorDur);
      return diffA - diffB;
    });

    fullConcerts.sort((a, b) => (b.duration || 0) - (a.duration || 0));

    return {
      sameSongFancams: fancams,
      longBridgeVideos: fullConcerts,
      allOverlapping: [...fancams, ...fullConcerts]
    };
  }, [allConcertVideos, anchorVideo, anchorStart, anchorDur, anchorEnd]);

  const displayedVideos = filterMode === 'FANCAMS' ? (sameSongFancams.length > 0 ? sameSongFancams : allOverlapping) : allOverlapping;

  const selectTarget = (v: Video) => {
    setTargetVideo(v);
    const off = v.sync_offset || 0;
    setTargetOffset(off);
    setInitialTargetOffset(off);
    setSaveSuccess(false);
  };

  // Auto-select initial target video (Prioritize same song fancams over full concert)
  useEffect(() => {
    if (!targetVideo) {
      if (sameSongFancams.length > 0) {
        selectTarget(sameSongFancams[0]);
      } else if (allOverlapping.length > 0) {
        selectTarget(allOverlapping[0]);
      }
    }
  }, [sameSongFancams, allOverlapping, targetVideo]);

  // Nudge Target Offset
  const nudge = (deltaSec: number) => {
    setTargetOffset(prev => {
      const updated = Math.round((prev + deltaSec) * 100) / 100;
      if (playerA && playerB && isPlaying) {
        try {
          const timeA = playerA.getCurrentTime();
          const concertTime = timeA + (anchorVideo.sync_offset || 0);
          const timeB = concertTime - updated;
          if (timeB >= 0) playerB.seekTo(timeB, true);
        } catch (e) {}
      }
      return updated;
    });
  };

  // Sync Interval Loop
  useEffect(() => {
    if (!isPlaying || !playerA || !playerB) return;

    const interval = setInterval(() => {
      try {
        const timeA = playerA.getCurrentTime();
        const concertTime = timeA + (anchorVideo.sync_offset || 0);
        const expectedTimeB = concertTime - targetOffset;

        if (expectedTimeB >= 0) {
          const actualTimeB = playerB.getCurrentTime();
          if (Math.abs(actualTimeB - expectedTimeB) > 0.3) {
            playerB.seekTo(expectedTimeB, true);
          }
        }
      } catch (err) {}
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, playerA, playerB, targetOffset, anchorVideo]);

  // Handle Play / Pause
  const togglePlay = () => {
    if (!playerA || !playerB) return;
    if (isPlaying) {
      playerA.pauseVideo();
      playerB.pauseVideo();
      setIsPlaying(false);
    } else {
      const timeA = playerA.getCurrentTime();
      const concertTime = timeA + (anchorVideo.sync_offset || 0);
      const expectedTimeB = Math.max(0, concertTime - targetOffset);
      playerB.seekTo(expectedTimeB, true);
      
      playerA.playVideo();
      playerB.playVideo();
      setIsPlaying(true);
    }
  };

  // Audio Mode Management
  useEffect(() => {
    if (!playerA || !playerB) return;
    try {
      if (audioMode === 'A') {
        playerA.unMute();
        playerB.mute();
      } else if (audioMode === 'B') {
        playerA.mute();
        playerB.unMute();
      } else if (audioMode === 'BOTH') {
        playerA.unMute();
        playerB.unMute();
      } else {
        playerA.mute();
        playerB.mute();
      }
    } catch (e) {}
  }, [audioMode, playerA, playerB]);

  // Format mm:ss
  const formatTime = (secs: number) => {
    const abs = Math.abs(secs);
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    const ms = Math.floor((abs % 1) * 10);
    const formatted = `${m}:${s.toString().padStart(2, '0')}.${ms}`;
    return secs < 0 ? `-${formatted}` : formatted;
  };

  const formatDuration = (secs: number | null | undefined) => {
    if (!secs) return '0s';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Delta calculation
  const delta = Math.round((targetOffset - initialTargetOffset) * 100) / 100;

  // Save changes
  const handleSave = async () => {
    if (!targetVideo) return;
    setIsSaving(true);
    try {
      if (adminKey) {
        await axios.patch(`${API_BASE_URL}/videos/${targetVideo.id}`, {
          sync_offset: targetOffset
        }, {
          headers: { 'X-Admin-Key': adminKey }
        });
      } else {
        await axios.post(`${API_BASE_URL}/contributions`, {
          video_id: targetVideo.id,
          suggested_sync_offset: targetOffset
        });
      }
      setSaveSuccess(true);
      onSaved(targetVideo.id, targetOffset);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      alert("Error saving sync calibration");
    } finally {
      setIsSaving(false);
    }
  };

  // Timeline Bar View Range (Zoom tightly onto song window if looking at fancams)
  const timelineMin = Math.max(0, anchorStart - 30);
  const timelineMax = anchorEnd + 30;
  const timelineSpan = Math.max(1, timelineMax - timelineMin);

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 md:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800/80 rounded-[2rem] w-full max-w-6xl max-h-[94vh] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-twice-magenta to-twice-apricot flex items-center justify-center text-white shadow-lg shadow-twice-magenta/20">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                1:1 Fancam Sync Calibrator
                <span className="text-[10px] bg-twice-magenta/20 text-twice-magenta px-2 py-0.5 rounded-full font-bold border border-twice-magenta/30">
                  {anchorVideo.songs && anchorVideo.songs[0] ? anchorVideo.songs[0].name : 'Song Focus'}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                원하는 직캠(Target B)을 선택해 0.05초 단위로 싱크를 맞춥니다.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 custom-scrollbar">

          {/* 1. Category Filter Tabs & Target Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 flex items-center gap-1.5 ml-1">
                <Filter className="h-3.5 w-3.5 text-twice-apricot" /> 필터:
              </span>
              <button 
                onClick={() => setFilterMode('FANCAMS')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterMode === 'FANCAMS' ? 'bg-twice-magenta text-white shadow-md shadow-twice-magenta/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}
              >
                🎯 동일 곡 직캠만 보기 ({sameSongFancams.length})
              </button>
              {longBridgeVideos.length > 0 && (
                <button 
                  onClick={() => setFilterMode('ALL')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterMode === 'ALL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}
                >
                  👑 풀 콘서트 포함 전체 ({allOverlapping.length})
                </button>
              )}
            </div>

            {/* Target Video Quick Switcher Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-twice-magenta">🎯 보정 대상 선택:</span>
              <select 
                value={targetVideo?.id || 0} 
                onChange={e => {
                  const found = allOverlapping.find(v => v.id === parseInt(e.target.value));
                  if (found) selectTarget(found);
                }}
                className="bg-slate-950 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-twice-magenta cursor-pointer max-w-xs truncate"
              >
                {displayedVideos.map(v => {
                  const m = (v.members && v.members.length > 0) ? v.members[0] : '무대';
                  return (
                    <option key={v.id} value={v.id}>
                      [{m}] {v.title.slice(0, 35)}... ({formatDuration(v.duration)})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* 2. Timeline Bar Graph Visualizer */}
          <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-twice-apricot" />
                곡 구간 타임라인 바 ({displayedVideos.length + 1}개 앵글)
              </span>
              <span className="text-[11px] text-gray-500 font-mono">
                {formatTime(timelineMin)} ─── {formatTime(timelineMax)}
              </span>
            </div>

            {/* Gantt Bar Tracks */}
            <div className="space-y-2 pt-1">
              {/* Anchor Bar (Video A) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-gray-300">
                  <span className="font-bold flex items-center gap-1.5 text-twice-apricot">
                    <span className="w-2 h-2 rounded-full bg-twice-apricot animate-pulse"></span>
                    👑 [기준 앵커] {anchorVideo.title.slice(0, 45)}... ({formatDuration(anchorDur)})
                  </span>
                  <span className="font-mono text-[10px] text-gray-400">Offset: {formatTime(anchorStart)}</span>
                </div>
                <div className="h-4 bg-slate-950 rounded-lg overflow-hidden relative border border-twice-apricot/30">
                  <div 
                    className="h-full bg-gradient-to-r from-twice-apricot to-twice-magenta rounded-md transition-all shadow-sm"
                    style={{
                      marginLeft: `${Math.max(0, ((anchorStart - timelineMin) / timelineSpan) * 100)}%`,
                      width: `${Math.min(100, (anchorDur / timelineSpan) * 100)}%`
                    }}
                  />
                </div>
              </div>

              {/* Overlapping Candidate Bars */}
              {displayedVideos.map((v) => {
                const vStart = v.sync_offset || 0;
                const vDur = (v.duration && v.duration > 0) ? v.duration : 220;
                const isSelected = targetVideo?.id === v.id;
                const primaryMember = (v.members && v.members.length > 0) ? v.members[0] : '무대';
                const memberTheme = MEMBER_COLORS[primaryMember] || { bg: 'bg-slate-700', text: 'text-gray-300', border: 'border-slate-600', bar: 'bg-twice-magenta' };

                return (
                  <div 
                    key={v.id} 
                    onClick={() => selectTarget(v)}
                    className={`group cursor-pointer p-2.5 rounded-xl transition-all border ${isSelected ? 'bg-slate-800/90 border-twice-magenta shadow-lg shadow-twice-magenta/10 ring-1 ring-twice-magenta' : 'bg-slate-950/60 hover:bg-slate-800/50 border-slate-800/60'}`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={`font-bold flex items-center gap-2 truncate ${isSelected ? 'text-twice-magenta' : 'text-gray-300 group-hover:text-white'}`}>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${memberTheme.bg} ${memberTheme.text}`}>
                          {primaryMember}
                        </span>
                        {v.title.slice(0, 55)}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400 shrink-0 ml-2">
                        {formatDuration(vDur)} | Offset: {formatTime(isSelected ? targetOffset : vStart)}
                      </span>
                    </div>

                    <div className="h-3.5 bg-slate-900 rounded-md overflow-hidden relative">
                      <div 
                        className={`h-full rounded-md transition-all ${isSelected ? 'bg-gradient-to-r from-pink-500 to-twice-magenta' : 'bg-slate-700 opacity-70 group-hover:opacity-100'}`}
                        style={{
                          marginLeft: `${Math.max(0, (((isSelected ? targetOffset : vStart) - timelineMin) / timelineSpan) * 100)}%`,
                          width: `${Math.min(100, (vDur / timelineSpan) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Side-by-Side Dual Synchronized Player */}
          {targetVideo && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* Left Player: Anchor Video A */}
              <div className="bg-slate-900 rounded-2xl p-3 border border-twice-apricot/30 flex flex-col space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-tight text-twice-apricot flex items-center gap-1.5">
                    👑 기준 앵커 (Reference A)
                  </span>
                  <span className="text-[11px] font-mono text-gray-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-white/5">
                    Offset: {anchorStart.toFixed(2)}s ({formatDuration(anchorDur)})
                  </span>
                </div>
                <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-inner">
                  <YouTube
                    videoId={anchorVideo.youtube_id}
                    className="w-full h-full"
                    opts={{
                      width: '100%',
                      height: '100%',
                      playerVars: { autoplay: 0, controls: 1, mute: 1, playsinline: 1 }
                    }}
                    onReady={(e) => {
                      setPlayerA(e.target);
                      e.target.mute();
                    }}
                  />
                </div>
                <div className="truncate text-[11px] font-bold text-gray-300 px-1">
                  {anchorVideo.title}
                </div>
              </div>

              {/* Right Player: Target Video B */}
              <div className="bg-slate-900 rounded-2xl p-3 border border-twice-magenta/40 flex flex-col space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-tight text-twice-magenta flex items-center gap-1.5">
                    🎯 보정 대상 (Target B)
                  </span>
                  <span className="text-[11px] font-mono font-bold text-twice-magenta bg-twice-magenta/10 px-2 py-0.5 rounded-lg border border-twice-magenta/30">
                    Offset: {targetOffset.toFixed(2)}s ({formatDuration(targetVideo.duration)})
                  </span>
                </div>
                <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-inner">
                  <YouTube
                    videoId={targetVideo.youtube_id}
                    className="w-full h-full"
                    opts={{
                      width: '100%',
                      height: '100%',
                      playerVars: { autoplay: 0, controls: 1, mute: 1, playsinline: 1 }
                    }}
                    onReady={(e) => {
                      setPlayerB(e.target);
                      e.target.mute();
                    }}
                  />
                </div>
                <div className="truncate text-[11px] font-bold text-gray-300 px-1">
                  {targetVideo.title}
                </div>
              </div>

            </div>
          )}

          {/* 4. Micro-Delta Controls & Alignment Toolbar */}
          {targetVideo && (
            <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 space-y-4">
              
              {/* Playback & Audio Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={togglePlay}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg ${isPlaying ? 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20' : 'bg-twice-magenta hover:bg-pink-600 text-white shadow-twice-magenta/30 active:scale-95'}`}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    {isPlaying ? '동시 일시정지' : '동시 싱크 재생'}
                  </button>

                  <button 
                    onClick={() => {
                      if (playerA && playerB) {
                        playerA.seekTo(0, true);
                        const expectedB = Math.max(0, (anchorVideo.sync_offset || 0) - targetOffset);
                        playerB.seekTo(expectedB, true);
                      }
                    }}
                    className="p-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-xl transition-all"
                    title="처음으로 되감기"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Audio Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/5 text-[11px] font-bold">
                  <button 
                    onClick={() => setAudioMode('A')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${audioMode === 'A' ? 'bg-twice-apricot text-black font-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    🔊 앵커 A 소리
                  </button>
                  <button 
                    onClick={() => setAudioMode('B')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${audioMode === 'B' ? 'bg-twice-magenta text-white font-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    🔊 타겟 B 소리
                  </button>
                  <button 
                    onClick={() => setAudioMode('BOTH')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${audioMode === 'BOTH' ? 'bg-purple-600 text-white font-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    🎧 동시 출력 (비트 간섭)
                  </button>
                </div>
              </div>

              {/* Offset Fine-Tuning Pad */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">Target Offset Nudge</span>
                    <p className="text-[11px] text-gray-500">타겟 영상이 더 늦게 시작하면 [+], 더 일찍 시작하면 [-]</p>
                  </div>

                  {/* Offset & Delta Value Badge */}
                  <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-white/5">
                    <span className="text-xs text-gray-400 font-mono">
                      Delta: <strong className={delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}>{delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}s</strong>
                    </span>
                    <div className="h-3 w-px bg-white/10"></div>
                    <span className="text-sm font-mono font-black text-white">
                      {targetOffset.toFixed(2)}s
                    </span>
                  </div>
                </div>

                {/* Step Buttons */}
                <div className="grid grid-cols-6 gap-2">
                  <button onClick={() => nudge(-1.0)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    -1.0s
                  </button>
                  <button onClick={() => nudge(-0.1)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    -0.10s
                  </button>
                  <button onClick={() => nudge(-0.05)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-twice-magenta font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    -0.05s
                  </button>
                  <button onClick={() => nudge(+0.05)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-twice-magenta font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    +0.05s
                  </button>
                  <button onClick={() => nudge(+0.1)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    +0.10s
                  </button>
                  <button onClick={() => nudge(+1.0)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95">
                    +1.0s
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 md:px-6 bg-slate-900/90 border-t border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            {adminKey ? (
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin Mode (Direct Save)
              </span>
            ) : (
              <span className="text-[11px] font-bold text-twice-apricot bg-twice-apricot/10 px-3 py-1 rounded-full border border-twice-apricot/20">
                Community Mode (Submit Contribution)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors"
            >
              닫기
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving || !targetVideo}
              className={`px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg ${saveSuccess ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-gradient-to-r from-twice-magenta to-twice-apricot text-white hover:opacity-90 shadow-twice-magenta/30 active:scale-95'}`}
            >
              {saveSuccess ? (
                <>
                  <Check className="h-4 w-4" /> 싱크 저장 완료!
                </>
              ) : isSaving ? (
                '저장 중...'
              ) : (
                <>
                  <Save className="h-4 w-4" /> 싱크 오프셋 적용 및 저장
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default PairwiseTimelineCalibratorModal;
