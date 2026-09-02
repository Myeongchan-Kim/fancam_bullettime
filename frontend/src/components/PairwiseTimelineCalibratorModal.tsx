import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import YouTube, { YouTubePlayer } from 'react-youtube';
import axios from 'axios';
import { 
  X, Play, Pause, RotateCcw, Save, Check, 
  Sliders, ShieldCheck, Layers, Filter, Crosshair,
  GripVertical, MoveHorizontal,
  ArrowLeftRight, ExternalLink
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
  // Video A: Anchor (Fixed Reference) - can be swapped dynamically
  const [anchorVideo, setAnchorVideo] = useState<Video>(currentVideo);
  
  // Video B: Target video to calibrate against Anchor
  const [targetVideo, setTargetVideo] = useState<Video | null>(null);

  // Filter Mode: 'SAME_SONG' vs 'ALL'
  const [filterMode, setFilterMode] = useState<'SAME_SONG' | 'ALL'>('SAME_SONG');

  // Delta offset applied to Target Video
  const [targetOffset, setTargetOffset] = useState<number>(0);
  const [initialTargetOffset, setInitialTargetOffset] = useState<number>(0);

  // Dual Player States
  const [playerA, setPlayerA] = useState<YouTubePlayer | null>(null);
  const [playerB, setPlayerB] = useState<YouTubePlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioMode, setAudioMode] = useState<'A' | 'B' | 'BOTH' | 'MUTE'>('A');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Anchor window
  const anchorStart = anchorVideo.sync_offset || 0;
  const anchorDur = (anchorVideo.duration && anchorVideo.duration > 0) ? anchorVideo.duration : 220;
  const anchorEnd = anchorStart + anchorDur;
  const anchorSongIds = useMemo(() => anchorVideo.songs?.map(s => s.id) || [], [anchorVideo]);

  // Timeline Bar View Range
  const timelineMin = Math.max(0, anchorStart - 30);
  const timelineMax = anchorEnd + 30;
  const timelineSpan = Math.max(1, timelineMax - timelineMin);

  // Dragging State & Refs for Interactive Timeline Bar
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startOffset: number; trackWidth: number } | null>(null);

  // Separate same song fancams vs full concerts/other clips
  const { sameSongFancams, allOverlapping } = useMemo(() => {
    const sameSongList: Video[] = [];
    const otherOverlappingList: Video[] = [];

    allConcertVideos.forEach(v => {
      if (v.id === anchorVideo.id) return;
      const vStart = v.sync_offset || 0;
      const vDur = (v.duration && v.duration > 0) ? v.duration : 220;
      const vEnd = vStart + vDur;

      // Check if shares any song ID
      const sharesSong = v.songs?.some(s => anchorSongIds.includes(s.id));
      const dur = v.duration || 0;
      const isLongConcert = dur > 600 || (v.title && v.title.toLowerCase().includes('full concert'));

      if (sharesSong && !isLongConcert) {
        sameSongList.push(v);
      } else {
        // Only include in overlapping if it ACTUALLY overlaps (intersection > 0)
        const hasTrueOverlap = (vStart < anchorEnd && vEnd > anchorStart);
        if (hasTrueOverlap) {
          otherOverlappingList.push(v);
        }
      }
    });

    // Sort same song by closest duration
    sameSongList.sort((a, b) => {
      const diffA = Math.abs((a.duration || 220) - anchorDur);
      const diffB = Math.abs((b.duration || 220) - anchorDur);
      return diffA - diffB;
    });

    return {
      sameSongFancams: sameSongList,
      allOverlapping: [...sameSongList, ...otherOverlappingList]
    };
  }, [allConcertVideos, anchorVideo, anchorStart, anchorDur, anchorEnd, anchorSongIds]);

  const displayedVideos = filterMode === 'SAME_SONG' ? (sameSongFancams.length > 0 ? sameSongFancams : allOverlapping) : allOverlapping;

  const selectTarget = (v: Video) => {
    setTargetVideo(v);
    const off = v.sync_offset || 0;
    setTargetOffset(off);
    setInitialTargetOffset(off);
    setSaveSuccess(false);
    setSaveMessage('');
  };

  // ⇄ Swap Anchor Video A and Target Video B
  const handleSwapVideos = () => {
    if (!targetVideo) return;
    const prevAnchor = anchorVideo;
    const prevTarget = targetVideo;

    // Pause playback before swapping to prevent audio glitches
    try {
      playerA?.pauseVideo();
      playerB?.pauseVideo();
    } catch (err) {}
    setIsPlaying(false);

    setAnchorVideo(prevTarget);
    setTargetVideo(prevAnchor);
    const newTargetOffset = prevAnchor.sync_offset || 0;
    setTargetOffset(newTargetOffset);
    setInitialTargetOffset(newTargetOffset);
    setSaveSuccess(false);
    setSaveMessage('');
  };

  // Auto-select initial target video (Prioritize same song fancams)
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
          const targetDur = (targetVideo?.duration && targetVideo.duration > 0) ? targetVideo.duration : 300;
          if (timeB >= 0 && timeB <= targetDur) {
            playerB.seekTo(timeB, true);
          }
        } catch (e) {}
      }
      return updated;
    });
  };

  // Align offsets using the current paused positions in both players!
  const alignCurrentFrames = async () => {
    if (!playerA || !playerB || !targetVideo) return;
    try {
      const timeA = await playerA.getCurrentTime();
      const timeB = await playerB.getCurrentTime();
      // Since timeA + anchorOffset = concertTime = timeB + newTargetOffset
      // => newTargetOffset = timeA + anchorOffset - timeB
      const calculatedOffset = Math.round((timeA + (anchorVideo.sync_offset || 0) - timeB) * 100) / 100;
      setTargetOffset(calculatedOffset);
    } catch (e) {
      console.error("Error aligning frames", e);
    }
  };

  // Interactive Pointer Drag Handlers for Timeline Bar
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!targetVideo || !trackContainerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = trackContainerRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startOffset: targetOffset,
      trackWidth: Math.max(rect.width, 1)
    };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragRef.current || !targetVideo) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const deltaTime = (deltaX / dragRef.current.trackWidth) * timelineSpan;
    const newOffset = Math.round((dragRef.current.startOffset + deltaTime) * 100) / 100;

    setTargetOffset(newOffset);

    // Live preview in Player B if available
    if (playerA && playerB) {
      try {
        const timeA = playerA.getCurrentTime();
        const concertTime = timeA + (anchorVideo.sync_offset || 0);
        const expectedB = Math.max(0, concertTime - newOffset);
        const targetDur = (targetVideo?.duration && targetVideo.duration > 0) ? targetVideo.duration : 300;
        if (expectedB <= targetDur) {
          playerB.seekTo(expectedB, true);
        }
      } catch (err) {}
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  // Keyboard Shortcuts (Arrow keys to nudge, Space to play/pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudge(e.shiftKey ? -0.5 : -0.05);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudge(e.shiftKey ? 0.5 : 0.05);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playerA, playerB, isPlaying, targetOffset, targetVideo]);

  // Sync Interval Loop (With Strict Bounds Protection)
  useEffect(() => {
    if (!isPlaying || !playerA || !playerB || !targetVideo) return;

    const interval = setInterval(() => {
      try {
        const timeA = playerA.getCurrentTime();
        const concertTime = timeA + (anchorVideo.sync_offset || 0);
        const expectedTimeB = concertTime - targetOffset;
        const targetDur = (targetVideo.duration && targetVideo.duration > 0) ? targetVideo.duration : 300;

        if (expectedTimeB >= 0 && expectedTimeB <= targetDur) {
          const actualTimeB = playerB.getCurrentTime();
          if (Math.abs(actualTimeB - expectedTimeB) > 0.3) {
            playerB.seekTo(expectedTimeB, true);
          }
        }
      } catch (err) {}
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, playerA, playerB, targetOffset, anchorVideo, targetVideo]);

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
      const targetDur = (targetVideo?.duration && targetVideo.duration > 0) ? targetVideo.duration : 300;
      
      if (expectedTimeB <= targetDur) {
        playerB.seekTo(expectedTimeB, true);
      }
      
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
    setSaveMessage('');
    try {
      if (adminKey) {
        // Admin direct update
        await axios.patch(`${API_BASE_URL}/videos/${targetVideo.id}`, {
          sync_offset: targetOffset
        }, {
          headers: { 'X-Admin-Key': adminKey }
        });
        setSaveMessage('관리자 권한으로 싱크가 즉시 저장되었습니다!');
      } else {
        // User contribution submission (auto-approved if verified)
        await axios.post(`${API_BASE_URL}/videos/${targetVideo.id}/contributions`, {
          suggested_sync_offset: targetOffset
        });
        setSaveMessage('싱크 기여가 성공적으로 제출되었습니다!');
      }
      setSaveSuccess(true);
      onSaved(targetVideo.id, targetOffset);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Save sync error:", err);
      // If admin patch fails due to invalid key, try contribution fallback
      try {
        await axios.post(`${API_BASE_URL}/videos/${targetVideo.id}/contributions`, {
          suggested_sync_offset: targetOffset
        });
        setSaveMessage('싱크 기여로 정상 접수되었습니다!');
        setSaveSuccess(true);
        onSaved(targetVideo.id, targetOffset);
      } catch (fallbackErr) {
        alert("싱크 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsSaving(false);
    }
  };

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
                <Filter className="h-3.5 w-3.5 text-twice-apricot" /> 곡 필터:
              </span>
              <button 
                onClick={() => setFilterMode('SAME_SONG')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterMode === 'SAME_SONG' ? 'bg-twice-magenta text-white shadow-md shadow-twice-magenta/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}
              >
                🎯 동일 곡 직캠 ({sameSongFancams.length})
              </button>
              {allOverlapping.length > sameSongFancams.length && (
                <button 
                  onClick={() => setFilterMode('ALL')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${filterMode === 'ALL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-800 text-gray-400 hover:text-white'}`}
                >
                  🌐 겹치는 전체 영상 ({allOverlapping.length})
                </button>
              )}
            </div>

            {/* Target Video Quick Switcher Dropdown & Swap Button */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-twice-magenta">🎯 보정 대상:</span>
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

              {targetVideo && (
                <button
                  onClick={handleSwapVideos}
                  className="px-3 py-2 bg-gradient-to-r from-twice-apricot to-twice-magenta hover:opacity-90 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-twice-magenta/20 active:scale-95 shrink-0"
                  title="기준 앵커(A)와 보정 대상(B) 영상을 서로 맞바꿉니다."
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  ⇄ 기준/대상 맞바꾸기
                </button>
              )}
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
                const currentOffsetForBar = isSelected ? targetOffset : vStart;

                return (
                  <div 
                    key={v.id} 
                    onClick={() => {
                      if (!isSelected) selectTarget(v);
                    }}
                    className={`group p-2.5 rounded-xl transition-all border ${isSelected ? 'bg-slate-800/95 border-twice-magenta shadow-xl shadow-twice-magenta/15 ring-2 ring-twice-magenta/50' : 'cursor-pointer bg-slate-950/60 hover:bg-slate-800/50 border-slate-800/60'}`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={`font-bold flex items-center gap-2 truncate ${isSelected ? 'text-twice-magenta' : 'text-gray-300 group-hover:text-white'}`}>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${memberTheme.bg} ${memberTheme.text}`}>
                          {primaryMember}
                        </span>
                        {v.title.slice(0, 55)}
                        {isSelected && (
                          <span className="text-[10px] bg-twice-magenta/20 text-pink-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Crosshair className="h-3 w-3 animate-spin" /> 타겟 보정 중
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">
                        Offset: {formatTime(currentOffsetForBar)} ({formatDuration(vDur)})
                      </span>
                    </div>

                    {/* Interactive Draggable Bar for Selected Target */}
                    <div 
                      ref={isSelected ? trackContainerRef : null}
                      onPointerDown={isSelected ? handlePointerDown : undefined}
                      onPointerMove={isSelected ? handlePointerMove : undefined}
                      onPointerUp={isSelected ? handlePointerUp : undefined}
                      onPointerCancel={isSelected ? handlePointerUp : undefined}
                      className={`h-6 bg-slate-950 rounded-lg overflow-hidden relative select-none ${isSelected ? 'cursor-grab active:cursor-grabbing border border-twice-magenta/40' : 'border border-white/5'}`}
                    >
                      <div 
                        className={`h-full rounded-md transition-all flex items-center justify-between px-2 ${isSelected ? 'bg-gradient-to-r from-twice-magenta to-pink-500 shadow-md ring-1 ring-white/30' : memberTheme.bar + ' opacity-40 group-hover:opacity-60'}`}
                        style={{
                          marginLeft: `${Math.max(0, ((currentOffsetForBar - timelineMin) / timelineSpan) * 100)}%`,
                          width: `${Math.min(100, (vDur / timelineSpan) * 100)}%`
                        }}
                      >
                        {isSelected && (
                          <>
                            <GripVertical className="h-3 w-3 text-white/90 shrink-0 drop-shadow" />
                            <span className="text-[9px] font-black tracking-wider text-white drop-shadow truncate mx-1 uppercase">
                              {isDragging ? `Offset: ${currentOffsetForBar.toFixed(2)}s` : 'Drag to Sync'}
                            </span>
                            <GripVertical className="h-3 w-3 text-white/90 shrink-0 drop-shadow" />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Side-by-Side Dual Synchronized Player */}
          {targetVideo && (
            <div className="space-y-3">
              {/* Dual Player Swap Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-4 py-2.5 rounded-2xl border border-slate-800 shadow-lg">
                <div className="flex items-center gap-2 text-xs text-gray-400 truncate">
                  <span className="font-bold text-twice-apricot flex items-center gap-1">
                    👑 A (기준): {anchorVideo.title.slice(0, 30)}...
                  </span>
                  <ArrowLeftRight className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                  <span className="font-bold text-twice-magenta flex items-center gap-1">
                    🎯 B (대상): {targetVideo.title.slice(0, 30)}...
                  </span>
                </div>
                <button
                  onClick={handleSwapVideos}
                  className="px-4 py-2 bg-gradient-to-r from-twice-apricot to-twice-magenta text-white font-black text-xs rounded-xl shadow-md shadow-twice-magenta/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 border border-white/20 shrink-0"
                  title="기준 앵커(A)와 보정 대상(B) 영상을 서로 맞바꿉니다."
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  ⇄ 기준 ↔ 대상 영상 맞바꾸기 (Swap)
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Left Player: Anchor Video A */}
                <div className="bg-slate-900 rounded-2xl p-3 border border-twice-apricot/30 flex flex-col space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-black uppercase tracking-tight text-twice-apricot flex items-center gap-1.5">
                      👑 기준 앵커 (Reference A)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-gray-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-white/5">
                        Offset: {anchorStart.toFixed(2)}s ({formatDuration(anchorDur)})
                      </span>
                      <a
                        href={`/video/${anchorVideo.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-gray-400 hover:text-white flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-white/5 hover:border-twice-apricot/40 transition-all"
                        title="이 영상의 상세 페이지 새 탭으로 열기"
                      >
                        <span>페이지</span>
                        <ExternalLink className="h-3 w-3 text-twice-apricot" />
                      </a>
                    </div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-twice-magenta bg-twice-magenta/10 px-2 py-0.5 rounded-lg border border-twice-magenta/30">
                        Offset: {targetOffset.toFixed(2)}s ({formatDuration(targetVideo.duration)})
                      </span>
                      <a
                        href={`/video/${targetVideo.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-gray-400 hover:text-white flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-white/5 hover:border-twice-magenta/40 transition-all"
                        title="이 영상의 상세 페이지 새 탭으로 열기"
                      >
                        <span>페이지</span>
                        <ExternalLink className="h-3 w-3 text-twice-magenta" />
                      </a>
                    </div>
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
            </div>
          )}

          {/* 4. Micro-Delta Controls & Alignment Toolbar */}
          {targetVideo && (
            <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 space-y-4">
              
              {/* Playback & Audio Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
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

                  <button 
                    onClick={alignCurrentFrames}
                    className="px-3.5 py-2.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                    title="양쪽 영상을 같은 순간에 정지해두고 이 버튼을 누르면 오프셋이 즉시 일치됩니다."
                  >
                    <Crosshair className="h-3.5 w-3.5 text-indigo-400" />
                    📍 현재 멈춘 장면으로 싱크 맞추기
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                      <Sliders className="h-3.5 w-3.5 text-twice-magenta" />
                      Target Offset Calibrator
                    </span>
                    <p className="text-[11px] text-gray-500">
                      상단 타임라인 바를 직접 드래그하거나 슬라이더/버튼으로 0.05초 단위 싱크를 맞추세요.
                    </p>
                  </div>

                  {/* Offset & Delta Value Badge & Reset */}
                  <div className="flex items-center gap-2">
                    {delta !== 0 && (
                      <button 
                        onClick={() => {
                          setTargetOffset(initialTargetOffset);
                          if (playerA && playerB) {
                            try {
                              const timeA = playerA.getCurrentTime();
                              const concertTime = timeA + (anchorVideo.sync_offset || 0);
                              const expectedB = Math.max(0, concertTime - initialTargetOffset);
                              playerB.seekTo(expectedB, true);
                            } catch (e) {}
                          }
                        }}
                        className="text-[11px] font-bold text-gray-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-white/5 transition-all flex items-center gap-1"
                        title="원래 저장된 오프셋으로 되돌리기"
                      >
                        <RotateCcw className="h-3 w-3" /> 초기화
                      </button>
                    )}
                    <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                      <span className="text-xs text-gray-400 font-mono">
                        Delta: <strong className={delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}>{delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}s</strong>
                      </span>
                      <div className="h-3 w-px bg-white/10"></div>
                      <span className="text-sm font-mono font-black text-white">
                        {targetOffset.toFixed(2)}s
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive Smooth Scrubber Slider */}
                <div className="bg-slate-950/80 p-3 rounded-xl border border-white/5 space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                    <span>{formatTime(timelineMin)} (일찍 시작)</span>
                    <span className="text-twice-magenta font-bold flex items-center gap-1">
                      <MoveHorizontal className="h-3 w-3 animate-pulse" /> 슬라이더로 빠른 오프셋 이동
                    </span>
                    <span>{formatTime(timelineMax)} (늦게 시작)</span>
                  </div>
                  <input
                    type="range"
                    min={timelineMin}
                    max={timelineMax}
                    step={0.05}
                    value={targetOffset}
                    onChange={(e) => {
                      const newOff = parseFloat(e.target.value);
                      setTargetOffset(newOff);
                      if (playerA && playerB) {
                        try {
                          const timeA = playerA.getCurrentTime();
                          const concertTime = timeA + (anchorVideo.sync_offset || 0);
                          const expectedB = Math.max(0, concertTime - newOff);
                          const targetDur = (targetVideo?.duration && targetVideo.duration > 0) ? targetVideo.duration : 300;
                          if (expectedB <= targetDur) {
                            playerB.seekTo(expectedB, true);
                          }
                        } catch (err) {}
                      }
                    }}
                    className="w-full accent-twice-magenta bg-slate-800 rounded-lg h-2 cursor-pointer transition-all hover:bg-slate-700"
                  />
                </div>

                {/* Micro Step Nudge Buttons */}
                <div className="grid grid-cols-6 gap-2">
                  <button onClick={() => nudge(-1.0)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    -1.0s
                  </button>
                  <button onClick={() => nudge(-0.1)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    -0.10s
                  </button>
                  <button onClick={() => nudge(-0.05)} className="py-2.5 bg-slate-800/80 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/30 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    -0.05s
                  </button>
                  <button onClick={() => nudge(+0.05)} className="py-2.5 bg-slate-800/80 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/30 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    +0.05s
                  </button>
                  <button onClick={() => nudge(+0.1)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    +0.10s
                  </button>
                  <button onClick={() => nudge(+1.0)} className="py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-mono text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm">
                    +1.0s
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 px-1">
                  <span>💡 단축키: <kbd className="px-1.5 py-0.5 bg-slate-800 text-gray-300 rounded border border-white/10 font-mono text-[10px]">←</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 text-gray-300 rounded border border-white/10 font-mono text-[10px]">→</kbd> 방향키로 0.05초 미세조정 (<kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded text-[9px]">Shift</kbd> 누르면 0.5초)</span>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 md:px-6 bg-slate-900/90 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            {adminKey ? (
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin Direct Save
              </span>
            ) : (
              <span className="text-[11px] font-bold text-twice-apricot bg-twice-apricot/10 px-3 py-1 rounded-full border border-twice-apricot/20">
                Community Contribution Mode
              </span>
            )}
            {saveMessage && (
              <span className="text-xs font-bold text-emerald-400 animate-in fade-in duration-200">
                {saveMessage}
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
