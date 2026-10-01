import { useState, useEffect, useRef, useMemo, useImperativeHandle, forwardRef, useCallback } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Maximize2, ExternalLink, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Video } from '../types';
import { getMasterConcertTime, getLocalVideoTime, isVideoActiveAtConcertTime } from '../utils/timelineSync';
import { packMobileTiles } from '../utils/tilePacker';
import { useGlobalAudio } from '../context/AudioContext';

export interface MultiAnglePlayerRef {
  getCurrentConcertTime: () => number;
}

interface MultiAnglePlayerProps {
  videos: Video[];
}

const SYNC_THRESHOLD = 0.5; // seconds difference before forcing seek

const MultiAnglePlayer = forwardRef<MultiAnglePlayerRef, MultiAnglePlayerProps>(({ videos }, ref) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialTime = parseInt(queryParams.get('t') || '0', 10);
  const { isMuted, toggleGlobalMute, setActiveAudioSource } = useGlobalAudio();

  const [masterId, setMasterId] = useState<number>(videos[0]?.id);
  const [players, setPlayers] = useState<{ [key: number]: YouTubePlayer }>({});
  const playersRef = useRef<{ [key: number]: YouTubePlayer }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentConcertTime, setCurrentConcertTime] = useState<number>(0);
  const currentConcertTimeRef = useRef<number>(0);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Multi-Angle Barrier Synchronization States (Wait until all initial angles buffer)
  const [readyVideoIds, setReadyVideoIds] = useState<Set<number>>(new Set());
  const [isBarrierReleased, setIsBarrierReleased] = useState(false);
  const isBarrierReleasedRef = useRef(false);

  // Responsive layout & Touch Immersive Mode states
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' && window.innerWidth > window.innerHeight && window.innerWidth < 1280);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsDesktop(w >= 1280);
      setIsLandscape(w > h && w < 1280);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const triggerOverlay = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 3500);
  }, []);

  const toggleOverlay = useCallback(() => {
    setShowOverlay(prev => {
      if (!prev) {
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = setTimeout(() => {
          setShowOverlay(false);
        }, 3500);
        return true;
      } else {
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
        return false;
      }
    });
  }, []);

  useImperativeHandle(ref, () => ({
    getCurrentConcertTime: () => currentConcertTimeRef.current
  }));

  // Sync internal state when navigating between videos (e.g. clicking back/forward or promo/demote)
  useEffect(() => {
    if (videos[0]?.id && videos[0].id !== masterId) {
      setMasterId(videos[0].id);
      setIsPlaying(false);
      setReadyVideoIds(new Set());
      isBarrierReleasedRef.current = false;
      setIsBarrierReleased(false);
    }
  }, [videos[0]?.id]);

  const masterVideo = videos.find(v => v.id === masterId) || videos[0];
  
  // Slave videos that cover the current timeframe
  const slaveVideos = useMemo(() => {
    const filtered = videos.filter(v => {
      if (v.id === masterId) return false;
      return isVideoActiveAtConcertTime(v, currentConcertTime, 15);
    });

    // Sort to prioritize shorter, specific fancams over massive full concerts if they overlap
    return filtered.sort((a, b) => {
      const durA = (a.duration && a.duration > 0) ? a.duration : 9999;
      const durB = (b.duration && b.duration > 0) ? b.duration : 9999;
      return durA - durB;
    });
  }, [videos, masterId, currentConcertTime]);

  // Keep a ref to the latest slave videos for the stable interval loop
  const slaveVideosRef = useRef(slaveVideos);
  useEffect(() => {
    slaveVideosRef.current = slaveVideos;
  }, [slaveVideos]);

  // Target initial video IDs that must be ready before simultaneous start
  const initialActiveSlaveIds = useMemo(() => {
    const initConcertTime = masterVideo ? getMasterConcertTime(masterVideo, initialTime) : initialTime;
    return videos
      .filter(v => v.id !== masterId && isVideoActiveAtConcertTime(v, initConcertTime, 15))
      .slice(0, 4)
      .map(v => v.id);
  }, [videos, masterId, masterVideo, initialTime]);

  const targetVideoIds = useMemo(() => {
    return masterId ? [masterId, ...initialActiveSlaveIds] : [];
  }, [masterId, initialActiveSlaveIds]);

  // Synchronously release all players to start playback in lockstep
  const releaseBarrier = useCallback(() => {
    if (isBarrierReleasedRef.current) return;
    isBarrierReleasedRef.current = true;
    setIsBarrierReleased(true);

    const allPlayers = playersRef.current;
    const masterPlayer = allPlayers[masterId];
    if (masterPlayer && typeof masterPlayer.playVideo === 'function' && masterPlayer.getIframe()) {
      try {
        masterPlayer.playVideo();
      } catch (err) {
        console.warn('Error starting master player:', err);
      }
    }

    Object.entries(allPlayers).forEach(([idStr, p]) => {
      const id = parseInt(idStr, 10);
      if (id !== masterId && p && typeof p.playVideo === 'function' && p.getIframe()) {
        try {
          p.playVideo();
        } catch (err) {
          console.warn(`Error starting slave player ${id}:`, err);
        }
      }
    });

    setIsPlaying(true);
  }, [masterId]);

  const handleReady = (e: YouTubeEvent, videoId: number) => {
    if (e.target && e.target.getIframe()) {
      playersRef.current[videoId] = e.target;
      setPlayers(prev => ({ ...prev, [videoId]: e.target }));

      // Ensure all videos start muted initially to satisfy mobile autoplay policies
      try {
        e.target.mute();
      } catch (err) {}

      // Keep paused if barrier has not yet been released
      if (!isBarrierReleasedRef.current) {
        try {
          e.target.pauseVideo();
        } catch (err) {}
      } else {
        if (isPlaying) {
          try {
            e.target.playVideo();
          } catch (err) {}
        }
      }

      setReadyVideoIds(prev => {
        const next = new Set(prev);
        next.add(videoId);
        return next;
      });
    }
  };

  // Barrier check: release when all target initial videos are ready
  useEffect(() => {
    if (isBarrierReleasedRef.current) return;
    if (targetVideoIds.length > 0 && targetVideoIds.every(id => readyVideoIds.has(id))) {
      releaseBarrier();
    }
  }, [readyVideoIds, targetVideoIds, releaseBarrier]);

  // Fallback safety timeout: max 3.5s wait so network jitter never stalls playback
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isBarrierReleasedRef.current) {
        releaseBarrier();
      }
    }, 3500);

    return () => clearTimeout(timer);
  }, [releaseBarrier]);

  // Stable sync loop with Buffering Guard
  useEffect(() => {
    syncInterval.current = setInterval(() => {
      const masterPlayer = playersRef.current[masterId];
      if (!masterPlayer || typeof masterPlayer.getCurrentTime !== 'function' || !masterPlayer.getIframe()) return;

      const masterLocalTime = masterPlayer.getCurrentTime();
      const newConcertTime = masterVideo ? getMasterConcertTime(masterVideo, masterLocalTime) : masterLocalTime;
      
      currentConcertTimeRef.current = newConcertTime;
      setCurrentConcertTime(newConcertTime);

      if (!isPlaying || !isBarrierReleasedRef.current) return;

      // Use the ref to get the latest visible slaves without restarting the interval
      slaveVideosRef.current.forEach(slave => {
        const slavePlayer = playersRef.current[slave.id];
        if (slavePlayer && typeof slavePlayer.getCurrentTime === 'function' && slavePlayer.getIframe()) {
          // Buffering Guard: If slave is currently buffering (state 3), do NOT seek!
          // Let it finish downloading its buffer chunks to avoid thrashing.
          if (typeof slavePlayer.getPlayerState === 'function') {
            const state = slavePlayer.getPlayerState();
            if (state === 3) { // 3 = BUFFERING
              return;
            }
          }

          const targetSlaveTime = getLocalVideoTime(slave, newConcertTime, 0);
          if (targetSlaveTime !== null && targetSlaveTime >= 0) {
            const slaveTime = slavePlayer.getCurrentTime();
            if (Math.abs(slaveTime - targetSlaveTime) > SYNC_THRESHOLD) {
              slavePlayer.seekTo(targetSlaveTime, true);
            }
          }
        }
      });
    }, 500);

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [isPlaying, masterId, masterVideo]);

  // Handle player cleanup only on unmount
  useEffect(() => {
    return () => { 
      setPlayers({}); 
      playersRef.current = {};
    };
  }, []);

  const handlePlay = (e: YouTubeEvent) => {
    // Ensure we only process events from the master player
    if (e.target === playersRef.current[masterId]) {
      setIsPlaying(true);
      if (isBarrierReleasedRef.current) {
        slaveVideos.forEach(slave => {
          const slavePlayer = playersRef.current[slave.id];
          if (slavePlayer && typeof slavePlayer.playVideo === 'function' && slavePlayer.getIframe()) {
            slavePlayer.playVideo();
          }
        });
      }
    }
  };

  const handlePause = (e: YouTubeEvent) => {
    if (e.target === playersRef.current[masterId]) {
      setIsPlaying(false);
      slaveVideos.forEach(slave => {
        const slavePlayer = playersRef.current[slave.id];
        if (slavePlayer && typeof slavePlayer.pauseVideo === 'function' && slavePlayer.getIframe()) {
          slavePlayer.pauseVideo();
        }
      });
    }
  };

  // Reflect master video to global active audio label
  useEffect(() => {
    if (masterVideo) {
      setActiveAudioSource(`Video #${masterVideo.id}`);
    }
  }, [masterVideo?.id]);

  useEffect(() => {
    // Enforce audio routing: Only master player is unmuted (when !isMuted), all others always muted
    Object.keys(playersRef.current).forEach(idStr => {
      const id = parseInt(idStr);
      const player = playersRef.current[id];
      if (player && typeof player.mute === 'function' && player.getIframe()) {
        if (id === masterId) {
          if (isMuted) {
            player.mute();
          } else {
            player.unMute();
          }
        } else {
          player.mute();
        }
      }
    });
  }, [masterId, players, isMuted]);

  const setAsMaster = (id: number) => {
    if (id === masterId) return;
    triggerOverlay();

    // Pause current master to avoid overlapping audio
    const oldMasterPlayer = playersRef.current[masterId];
    if (oldMasterPlayer && typeof oldMasterPlayer.pauseVideo === 'function' && oldMasterPlayer.getIframe()) {
      oldMasterPlayer.pauseVideo();
    }

    // Calculate the target time for the new master video based on current concert time
    const newMaster = videos.find(v => v.id === id);
    const targetTime = newMaster ? (getLocalVideoTime(newMaster, currentConcertTimeRef.current, 0) ?? 0) : 0;

    // Crucial: Update URL first. Pushing to history allows the back button to work.
    // The ?t= param ensures the new video starts at the exact synchronized time.
    navigate(`/video/${id}?t=${Math.floor(targetTime)}`);

    setMasterId(id);
    setIsPlaying(false);
  };

  const optsMaster = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1 as const,
      mute: 1 as const, // Must be muted initially to guarantee mobile iOS/Android autoplay
      modestbranding: 1 as const,
      rel: 0 as const,
      start: initialTime,
      playsinline: 1 as const, // Crucial for iOS inline playback
    },
  };
  const getSlaveOpts = (slaveVideo: Video) => {
    // We'll use a one-time calculation for the initial start time 
    // to avoid the player restarting when currentConcertTime updates.
    const initialConcertTime = masterVideo ? getMasterConcertTime(masterVideo, initialTime) : initialTime;
    const targetTime = getLocalVideoTime(slaveVideo, initialConcertTime, 0) ?? 0;

    return {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1 as const,
        mute: 1 as const,
        modestbranding: 1 as const,
        rel: 0 as const,
        controls: 0 as const,
        disablekb: 1 as const,
        playsinline: 1 as const,
        start: Math.floor(targetTime),
      },
    };
  };

  // Only show slave videos that are actually active at the CURRENT concert time
  const activeSlaveVideos = useMemo(() => {
    return slaveVideos.filter(v => {
      // 15s padding ensures fancams starting slightly after the intro are visible and pre-buffered from second 0
      return getLocalVideoTime(v, currentConcertTime, 15) !== null;
    });
  }, [slaveVideos, currentConcertTime]);

  const mobileGroups = useMemo(() => {
    return packMobileTiles(masterVideo, activeSlaveVideos, isLandscape);
  }, [masterVideo, activeSlaveVideos, isLandscape]);

  return (
    <div className="w-full rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border-0 sm:border border-slate-800 bg-slate-950 p-0 sm:p-4 xl:p-6 relative">
      {/* Multi-Angle Barrier Sync Loading HUD */}
      {!isBarrierReleased && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none transition-opacity duration-500">
          <div className="relative flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-full border-2 border-twice-magenta/20 border-t-twice-magenta animate-spin"></div>
            <Sparkles className="w-6 h-6 text-twice-apricot absolute animate-pulse" />
          </div>
          <div className="text-white text-base sm:text-lg font-black tracking-wider mb-1 flex items-center gap-2">
            <span>SYNCHRONIZING MULTI-ANGLES</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-300 font-medium">
            Preparing simultaneous playback ({readyVideoIds.size} / {Math.max(targetVideoIds.length, 1)} ready)
          </div>
          {/* Progress bar */}
          <div className="w-56 sm:w-72 h-1.5 bg-slate-800 rounded-full mt-4 overflow-hidden shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-twice-magenta via-twice-apricot to-twice-magenta transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((readyVideoIds.size / Math.max(targetVideoIds.length, 1)) * 100))}%` }}
            ></div>
          </div>
          <div className="text-[10px] text-gray-500 mt-2">
            Waiting for angles to buffer before synchronized start
          </div>
        </div>
      )}

      {isDesktop ? (
        /* Desktop Studio Layout (>= 1280px) */
        <div className="grid grid-cols-1 xl:grid-cols-5 xl:grid-rows-[auto_1fr] gap-4 xl:gap-6">
          
          {/* Master View (Top-Left) - Spans 3 columns */}
          <div className="xl:col-span-3 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-2 sm:mb-4 px-4 sm:px-0 pt-2 sm:pt-0">
              <h2 className="text-base sm:text-xl font-black text-white flex items-center gap-2 truncate">
                <span className="bg-twice-magenta text-white px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs shrink-0">MASTER</span>
                <span className="truncate">{masterVideo?.title}</span>
              </h2>
            </div>
            <div className="aspect-video w-full rounded-none sm:rounded-2xl overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border-0 sm:border border-slate-800 relative group">
              {masterVideo && (
                <YouTube 
                  key={`master-${masterVideo.id}`}
                  videoId={masterVideo.youtube_id} 
                  opts={optsMaster} 
                  onReady={(e) => handleReady(e, masterVideo.id)}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  className="w-full h-full absolute inset-0"
                  iframeClassName="w-full h-full block"
                />
              )}
            </div>
            <div className="mt-3 sm:mt-4 px-4 sm:px-0 flex flex-wrap gap-2 sm:gap-4 text-xs text-gray-400 font-bold uppercase tracking-wider">
              <span className="text-twice-magenta">{masterVideo?.members?.join(", ") || 'No Members Tagged'}</span>
              <span className="hidden sm:inline opacity-30">•</span>
              <span className="text-twice-apricot">
                {masterVideo?.songs && masterVideo.songs.length > 0 
                  ? masterVideo.songs.map(s => s.name).join(', ') 
                  : 'Unknown Song'}
              </span>
              <span className="hidden sm:inline opacity-30">•</span>
              <span>Offset: {masterVideo?.sync_offset || 0}s</span>
            </div>
          </div>

          {/* Side Slaves (Right Sidebar) - Spans the right-most 2 columns */}
          <div className="xl:col-span-2 xl:row-span-2 flex flex-col space-y-4 xl:max-h-[850px] xl:overflow-y-auto no-scrollbar min-w-0 pb-4 sm:pb-0">
            <div className="px-4 sm:px-0">
              <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1 flex items-center gap-2 shrink-0">
                <div className="h-px flex-1 bg-slate-800"></div>
                SIDE ANGLES
                <div className="h-px flex-1 bg-slate-800"></div>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
              {activeSlaveVideos.slice(0, 4).map(video => (
                <div 
                  key={video.id} 
                  className="bg-slate-900 rounded-none sm:rounded-xl overflow-hidden border-x-0 border-y sm:border border-slate-800 hover:border-twice-apricot transition-colors group cursor-pointer relative shrink-0 w-full"
                  onClick={() => setAsMaster(video.id)}
                >
                  <div className="aspect-video relative bg-black w-full">
                    <YouTube 
                      key={`slave-static-${video.id}`}
                      videoId={video.youtube_id} 
                      opts={getSlaveOpts(video)} 
                      onReady={(e) => handleReady(e, video.id)}
                      className="w-full h-full absolute inset-0 pointer-events-none"
                      iframeClassName="w-full h-full block"
                    />
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/70 transition-colors p-4 gap-2">
                       <div className="opacity-0 group-hover:opacity-100 text-white font-bold text-xs text-center line-clamp-2 drop-shadow-md transition-opacity duration-300">
                         {video.title}
                       </div>
                       <div className="opacity-0 group-hover:opacity-100 bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg flex items-center gap-1 transition-transform scale-90 group-hover:scale-100">
                         <Maximize2 className="w-3 h-3" /> SET AS MASTER
                       </div>
                    </div>
                  </div>
                  <div className="p-3 px-4 sm:px-3">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-[10px] font-bold text-white line-clamp-1 flex-1">{video.title}</h4>
                      <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-gray-500 transition-colors">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {activeSlaveVideos.length === 0 && (
              <div className="mx-4 sm:mx-0 py-10 text-center border-2 border-dashed border-slate-800 rounded-2xl">
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No Live Angles</span>
              </div>
            )}
          </div>

          {/* Bottom Slaves (Horizontal Flow) - Spans 3 columns below Master */}
          {activeSlaveVideos.length > 4 && (
            <div className="xl:col-span-3 flex flex-col space-y-4 pb-4 sm:pb-0">
              <div className="px-4 sm:px-0">
                <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1 flex items-center gap-2 shrink-0">
                  <div className="h-px flex-1 bg-slate-800"></div>
                  ADDITIONAL ANGLES ({activeSlaveVideos.length - 4})
                  <div className="h-px flex-1 bg-slate-800"></div>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {activeSlaveVideos.slice(4, 12).map(video => (
                  <div 
                    key={video.id} 
                    className="bg-slate-900 rounded-none sm:rounded-xl overflow-hidden border-x-0 border-y sm:border border-slate-800 hover:border-twice-apricot transition-colors group cursor-pointer relative shrink-0 w-full"
                    onClick={() => setAsMaster(video.id)}
                  >
                    <div className="aspect-video relative bg-black w-full">
                      <YouTube 
                        key={`slave-static-extra-${video.id}`}
                        videoId={video.youtube_id} 
                        opts={getSlaveOpts(video)} 
                        onReady={(e) => handleReady(e, video.id)}
                        className="w-full h-full absolute inset-0 pointer-events-none"
                        iframeClassName="w-full h-full block"
                      />
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/70 transition-colors p-4 gap-2">
                         <div className="opacity-0 group-hover:opacity-100 text-white font-bold text-[10px] text-center line-clamp-2 drop-shadow-md transition-opacity duration-300">
                           {video.title}
                         </div>
                         <div className="opacity-0 group-hover:opacity-100 bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg flex items-center gap-1 transition-transform scale-90 group-hover:scale-100">
                           <Maximize2 className="w-3 h-3" /> SET MASTER
                         </div>
                      </div>
                    </div>
                    <div className="p-2.5 px-4 sm:px-2.5">
                      <h4 className="text-[10px] font-bold text-white line-clamp-1 truncate">{video.title}</h4>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Mobile / Tablet Smart Tile Mosaic Layout (< 1280px) with Touch HUD */
        <div 
          className="w-full relative bg-black select-none overflow-hidden"
          onClick={toggleOverlay}
        >
          {/* Sticky Top Floating HUD */}
          <div 
            className={`sticky top-0 inset-x-0 z-30 px-3 py-2 bg-gradient-to-b from-black/95 via-black/70 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
              showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="bg-twice-magenta text-white px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 shadow">
                MASTER
              </span>
              <span className="text-white text-xs font-bold truncate">
                {masterVideo?.title}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGlobalMute();
                }}
                className="p-1.5 bg-black/70 hover:bg-black/90 rounded-full border border-white/20 text-white active:scale-95 transition-transform"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-twice-apricot" />
                )}
              </button>
            </div>
          </div>

          {/* Dynamic Mosaic Video Groups */}
          <div className="w-full flex flex-col space-y-0.5 bg-black">
            {mobileGroups.map((group) => {
              if (group.type === 'master') {
                const tile = group.tiles[0];
                const isVertical = tile?.isVertical;
                return (
                  <div key={group.id} className="w-full flex flex-col relative bg-black">
                    <div className={`w-full relative bg-black overflow-hidden ${isVertical ? 'aspect-[9/16] max-h-[70vh] mx-auto' : 'aspect-video'}`}>
                      {masterVideo && (
                        <YouTube
                          key={`master-${masterVideo.id}`}
                          videoId={masterVideo.youtube_id}
                          opts={optsMaster}
                          onReady={(e) => handleReady(e, masterVideo.id)}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          className="w-full h-full absolute inset-0"
                          iframeClassName="w-full h-full block"
                        />
                      )}
                      {/* Master Touch HUD bottom info banner */}
                      <div
                        className={`absolute bottom-0 inset-x-0 z-20 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 pointer-events-none flex items-center justify-between text-[10px] text-gray-300 font-bold uppercase tracking-wider ${
                          showOverlay ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <span className="text-twice-magenta truncate max-w-[140px]">
                          {masterVideo?.members?.join(', ') || 'TWICE'}
                        </span>
                        <span className="text-twice-apricot truncate max-w-[140px]">
                          {masterVideo?.songs?.[0]?.name || 'Concert Song'}
                        </span>
                        <span className="text-gray-400 shrink-0">Offset: {masterVideo?.sync_offset || 0}s</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Slaves group (Vertical Trio, Vertical Pair, Horizontal Pair, etc.)
              return (
                <div key={group.id} className="w-full flex flex-col">
                  {showOverlay && group.label && (
                    <div className="px-3 py-1 bg-black/80 backdrop-blur-sm text-[9px] font-black tracking-widest text-gray-400 uppercase border-y border-white/5 flex items-center justify-between">
                      <span>{group.label}</span>
                      {group.type === 'vertical_trio' && (
                        <span className="text-twice-magenta">3 CAM COMBINED (27:16)</span>
                      )}
                    </div>
                  )}
                  <div className={`grid ${group.gridColsClass} gap-0.5 w-full bg-slate-950`}>
                    {group.tiles.map((tile) => {
                      const video = tile.video;
                      const isVert = tile.isVertical;
                      return (
                        <div
                          key={`tile-${video.id}`}
                          className={`relative bg-black w-full overflow-hidden ${
                            isVert ? 'aspect-[9/16]' : 'aspect-video'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAsMaster(video.id);
                          }}
                        >
                          <YouTube
                            key={`slave-${video.id}`}
                            videoId={video.youtube_id}
                            opts={getSlaveOpts(video)}
                            onReady={(e) => handleReady(e, video.id)}
                            className="w-full h-full absolute inset-0 pointer-events-none"
                            iframeClassName="w-full h-full block"
                          />

                          {/* Touch Floating Overlay on each slave tile */}
                          <div
                            className={`absolute inset-0 z-20 flex flex-col justify-between p-2 transition-opacity duration-300 bg-black/40 ${
                              showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                            }`}
                          >
                            <div className="flex justify-end">
                              <Link
                                to={`/video/${video.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 bg-black/70 rounded text-gray-300 hover:text-white"
                                title="Open Video Details"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                            <div className="flex flex-col items-center gap-1.5 my-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAsMaster(video.id);
                                }}
                                className="bg-twice-apricot text-black px-2.5 py-1 rounded-full text-[10px] font-black shadow-lg flex items-center gap-1 active:scale-95 transition-transform"
                              >
                                <Maximize2 className="w-2.5 h-2.5" /> SET MASTER
                              </button>
                            </div>
                            <div className="bg-black/80 backdrop-blur-sm p-1 rounded text-[9px] text-white font-medium line-clamp-1 truncate">
                              {video.title}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {activeSlaveVideos.length === 0 && (
            <div className="py-6 text-center border-t border-slate-900 bg-black/40">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                No Other Angles At Current Timestamp
              </span>
            </div>
          )}

          {/* Sticky Bottom Floating Sync HUD */}
          <div
            className={`sticky bottom-0 inset-x-0 z-30 px-3 py-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex items-center justify-between text-[10px] transition-opacity duration-300 pointer-events-auto ${
              showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-1.5 text-twice-apricot font-black">
              <Sparkles className="w-3 h-3 text-twice-magenta" />
              <span>MULTI-ANGLE SYNC ACTIVE</span>
            </div>
            <span className="text-[9px] text-gray-400">Tap anywhere to toggle HUD</span>
          </div>
        </div>
      )}
    </div>
  );
});

export default MultiAnglePlayer;
