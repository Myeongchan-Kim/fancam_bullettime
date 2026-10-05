import { useState, useEffect, useRef, useMemo, useImperativeHandle, forwardRef, useCallback } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Maximize2, ExternalLink, Volume2, VolumeX, Sparkles, Play } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Video } from '../types';
import { getMasterConcertTime, getLocalVideoTime, isVideoActiveAtConcertTime } from '../utils/timelineSync';
import { packMobileTiles, isVerticalVideo } from '../utils/tilePacker';
import { useGlobalAudio } from '../context/AudioContext';

export interface MultiAnglePlayerRef {
  getCurrentConcertTime: () => number;
}

interface MultiAnglePlayerProps {
  videos: Video[];
  isLoadingData?: boolean;
}

const SYNC_THRESHOLD = 0.5; // seconds difference before forcing seek

const MultiAnglePlayer = forwardRef<MultiAnglePlayerRef, MultiAnglePlayerProps>(({ videos, isLoadingData = false }, ref) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialTime = parseInt(queryParams.get('t') || '0', 10);
  const { isMuted, toggleGlobalMute, setActiveAudioSource } = useGlobalAudio();

  const [masterId, setMasterId] = useState<number | undefined>(videos[0]?.id);
  const [players, setPlayers] = useState<{ [key: number]: YouTubePlayer }>({});
  const playersRef = useRef<{ [key: number]: YouTubePlayer }>({});
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize concert time from initial master video or fallback to initialTime
  const initialConcertTime = useMemo(() => {
    const m = videos.find(v => v.id === masterId) || videos[0];
    return m ? getMasterConcertTime(m, initialTime) : initialTime;
  }, [videos, masterId, initialTime]);

  const [currentConcertTime, setCurrentConcertTime] = useState<number>(initialConcertTime);
  const currentConcertTimeRef = useRef<number>(initialConcertTime);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Multi-Angle Barrier Synchronization & Start-on-Click States
  const [readyVideoIds, setReadyVideoIds] = useState<Set<number>>(new Set());
  const [isReadyToPlay, setIsReadyToPlay] = useState(false);
  const [isBarrierReleased, setIsBarrierReleased] = useState(false);
  const isBarrierReleasedRef = useRef(false);
  const hasUserRequestedPlayRef = useRef(false);
  const mountTimeRef = useRef<number>(Date.now());
  const WARMUP_BUFFER_MS = 2000; // 2.0s pre-buffer settling period behind the curtain
  const MAX_SAFETY_TIMEOUT_MS = 4500; // 4.5s max safety fallback

  // Responsive layout & Touch Immersive Mode states
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' && window.innerWidth > window.innerHeight && window.innerWidth < 1024);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsDesktop(w >= 1024);
      setIsLandscape(w > h && w < 1024);
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
      const newMaster = videos[0];
      const newConcertTime = getMasterConcertTime(newMaster, initialTime);
      setMasterId(newMaster.id);
      setCurrentConcertTime(newConcertTime);
      currentConcertTimeRef.current = newConcertTime;
      setIsPlaying(false);
      setIsReadyToPlay(false);
      hasUserRequestedPlayRef.current = false;
      setReadyVideoIds(new Set());
      mountTimeRef.current = Date.now();
      isBarrierReleasedRef.current = false;
      setIsBarrierReleased(false);
    }
  }, [videos[0]?.id, masterId, initialTime]);

  // Synchronize concert time once videos are loaded if not playing yet
  useEffect(() => {
    if (videos.length > 0 && !isPlaying && !isBarrierReleasedRef.current) {
      const m = videos.find(v => v.id === masterId) || videos[0];
      if (m) {
        const initTime = getMasterConcertTime(m, initialTime);
        setCurrentConcertTime(initTime);
        currentConcertTimeRef.current = initTime;
      }
    }
  }, [videos, masterId, initialTime, isPlaying]);

  const masterVideo = videos.find(v => v.id === masterId) || videos[0];
  
  // Slave videos that cover the current timeframe
  const slaveVideos = useMemo(() => {
    if (!masterVideo) return [];
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
  }, [videos, masterId, currentConcertTime, masterVideo]);

  // Keep a ref to the latest slave videos for the stable interval loop
  const slaveVideosRef = useRef(slaveVideos);
  useEffect(() => {
    slaveVideosRef.current = slaveVideos;
  }, [slaveVideos]);

  // Target initial video IDs that must be ready before simultaneous start
  const initialActiveSlaveIds = useMemo(() => {
    if (!masterVideo) return [];
    const initConcertTime = getMasterConcertTime(masterVideo, initialTime);
    return videos
      .filter(v => v.id !== masterId && isVideoActiveAtConcertTime(v, initConcertTime, 15))
      .slice(0, 4)
      .map(v => v.id);
  }, [videos, masterId, masterVideo, initialTime]);

  const targetVideoIds = useMemo(() => {
    return masterVideo ? [masterVideo.id, ...initialActiveSlaveIds] : [];
  }, [masterVideo, initialActiveSlaveIds]);

  // Synchronously re-align all players and release barrier for playback
  const releaseBarrier = useCallback(() => {
    if (isBarrierReleasedRef.current) return;
    isBarrierReleasedRef.current = true;
    setIsBarrierReleased(true);

    const initConcertTime = masterVideo ? getMasterConcertTime(masterVideo, initialTime) : initialTime;
    const allPlayers = playersRef.current;
    const masterPlayer = masterId ? allPlayers[masterId] : undefined;

    // Re-align master player to exact start timestamp and unmute if permitted
    if (masterPlayer && typeof masterPlayer.seekTo === 'function' && masterPlayer.getIframe()) {
      try {
        masterPlayer.seekTo(initialTime, true);
        if (!isMuted) {
          masterPlayer.unMute();
        }
        masterPlayer.playVideo();
      } catch (err) {
        console.warn('Error starting master player:', err);
      }
    }

    // Re-align all slave players to their exact synchronized concert timestamps
    slaveVideosRef.current.forEach(slave => {
      const slavePlayer = allPlayers[slave.id];
      if (slavePlayer && typeof slavePlayer.playVideo === 'function' && slavePlayer.getIframe()) {
        try {
          const targetSlaveTime = getLocalVideoTime(slave, initConcertTime, 0);
          slavePlayer.mute();
          slavePlayer.playVideo();
          if (targetSlaveTime !== null && targetSlaveTime >= 0) {
            slavePlayer.seekTo(targetSlaveTime, true);
          }
        } catch (err) {
          console.warn(`Error starting slave player ${slave.id}:`, err);
        }
      }
    });

    setIsPlaying(true);
  }, [masterId, masterVideo, initialTime, isMuted]);

  // Pre-buffer and freeze all players at initial timestamps, revealing the Play button
  const freezeAtStartPosition = useCallback(() => {
    if (isReadyToPlay || isBarrierReleasedRef.current) return;

    const initConcertTime = masterVideo ? getMasterConcertTime(masterVideo, initialTime) : initialTime;
    const allPlayers = playersRef.current;
    const masterPlayer = masterId ? allPlayers[masterId] : undefined;

    if (masterPlayer && typeof masterPlayer.pauseVideo === 'function' && masterPlayer.getIframe()) {
      try {
        masterPlayer.pauseVideo();
        masterPlayer.seekTo(initialTime, true);
      } catch (err) {}
    }

    slaveVideosRef.current.forEach(slave => {
      const slavePlayer = allPlayers[slave.id];
      if (slavePlayer && typeof slavePlayer.pauseVideo === 'function' && slavePlayer.getIframe()) {
        try {
          const targetSlaveTime = getLocalVideoTime(slave, initConcertTime, 0);
          if (targetSlaveTime !== null && targetSlaveTime >= 0) {
            slavePlayer.pauseVideo();
            slavePlayer.seekTo(targetSlaveTime, true);
          }
        } catch (err) {}
      }
    });

    setIsReadyToPlay(true);

    if (hasUserRequestedPlayRef.current) {
      releaseBarrier();
    }
  }, [masterId, masterVideo, initialTime, isReadyToPlay, releaseBarrier]);

  const handleStartPlayback = useCallback(() => {
    if (isBarrierReleasedRef.current) return;
    if (isReadyToPlay) {
      releaseBarrier();
    } else {
      hasUserRequestedPlayRef.current = true;
      if (targetVideoIds.length > 0 && targetVideoIds.every(id => readyVideoIds.has(id))) {
        freezeAtStartPosition();
      }
    }
  }, [isReadyToPlay, releaseBarrier, targetVideoIds, readyVideoIds, freezeAtStartPosition]);

  const handleReady = (e: YouTubeEvent, videoId: number) => {
    if (e.target && e.target.getIframe()) {
      playersRef.current[videoId] = e.target;
      setPlayers(prev => ({ ...prev, [videoId]: e.target }));

      // Ensure all videos seek to exact target time and start muted background pre-buffering
      try {
        e.target.mute();
        const initConcertTime = masterVideo ? getMasterConcertTime(masterVideo, initialTime) : initialTime;
        if (videoId === masterId) {
          if (initialTime > 0) {
            e.target.seekTo(initialTime, true);
          }
        } else {
          const slave = videos.find(v => v.id === videoId);
          if (slave) {
            const targetSlaveTime = getLocalVideoTime(slave, initConcertTime, 0);
            if (targetSlaveTime !== null && targetSlaveTime >= 0) {
              e.target.seekTo(targetSlaveTime, true);
            }
          }
        }
        e.target.playVideo();
      } catch (err) {}

      setReadyVideoIds(prev => {
        const next = new Set(prev);
        next.add(videoId);
        return next;
      });
    }
  };

  // Warmup and freeze ready check: once all initial angles buffer + warmup time elapsed
  useEffect(() => {
    if (isReadyToPlay || isBarrierReleasedRef.current) return;

    const allReady = targetVideoIds.length > 0 && targetVideoIds.every(id => readyVideoIds.has(id));
    if (allReady) {
      const elapsed = Date.now() - mountTimeRef.current;
      const remainingWarmup = Math.max(0, WARMUP_BUFFER_MS - elapsed);

      const warmupTimer = setTimeout(() => {
        freezeAtStartPosition();
      }, remainingWarmup);

      return () => clearTimeout(warmupTimer);
    }
  }, [readyVideoIds, targetVideoIds, freezeAtStartPosition, isReadyToPlay]);

  // Fallback safety timeout: after 4.5s, ready to play even if network had slight jitter
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReadyToPlay && !isBarrierReleasedRef.current) {
        freezeAtStartPosition();
      }
    }, MAX_SAFETY_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [freezeAtStartPosition, isReadyToPlay]);

  // Stable sync loop with Buffering Guard
  useEffect(() => {
    syncInterval.current = setInterval(() => {
      if (masterId === undefined) return;
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
          const targetSlaveTime = getLocalVideoTime(slave, newConcertTime, 0);
          if (targetSlaveTime !== null && targetSlaveTime >= 0) {
            const slaveTime = slavePlayer.getCurrentTime();
            const drift = Math.abs(slaveTime - targetSlaveTime);

            // Buffering Guard: If slave is currently buffering (state 3) AND within 2.0s of target,
            // let it finish downloading its buffer chunks to avoid thrashing.
            // But if it is buffering far away (> 2.0s drift, e.g. stuck at 0s), force seek immediately!
            if (typeof slavePlayer.getPlayerState === 'function') {
              const state = slavePlayer.getPlayerState();
              if (state === 3 && drift < 2.0) {
                return;
              }
            }

            if (drift > SYNC_THRESHOLD) {
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
    if (masterId !== undefined && e.target === playersRef.current[masterId]) {
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
    if (masterId !== undefined && e.target === playersRef.current[masterId]) {
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
    const oldMasterPlayer = masterId !== undefined ? playersRef.current[masterId] : undefined;
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
    <div className="w-full rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border-0 sm:border border-slate-800 bg-slate-950 p-0 relative min-h-[380px] sm:min-h-[500px]">
      {/* Multi-Angle Pre-Buffer & Play Overlay Screen */}
      <div 
        className={`absolute inset-0 z-50 bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none transition-opacity duration-500 ${
          isBarrierReleased ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
        }`}
      >
        {!isReadyToPlay ? (
          /* Pre-buffering Loading State */
          <div className="flex flex-col items-center max-w-md w-full">
            <div className="relative flex items-center justify-center mb-5">
              <div className="w-16 h-16 rounded-full border-2 border-twice-magenta/20 border-t-twice-magenta animate-spin"></div>
              <Sparkles className="w-6 h-6 text-twice-apricot absolute animate-pulse" />
            </div>
            <div className="text-white text-base sm:text-lg font-black tracking-wider mb-1.5 flex items-center gap-2">
              <span>SYNCHRONIZING MULTI-ANGLES</span>
            </div>
            <div className="text-xs sm:text-sm text-gray-400 font-medium max-w-sm">
              {isLoadingData || !masterVideo
                ? 'Connecting to concert archive...'
                : `Pre-buffering video angles (${readyVideoIds.size} / ${Math.max(targetVideoIds.length, 1)} loaded)`
              }
            </div>
            {/* Animated buffer warmup progress bar */}
            <div className="w-60 sm:w-72 h-1.5 bg-slate-900 rounded-full mt-5 overflow-hidden shadow-inner border border-slate-800">
              <div 
                className="h-full bg-gradient-to-r from-twice-magenta via-twice-apricot to-twice-magenta transition-all duration-300"
                style={{ 
                  width: isLoadingData || !masterVideo
                    ? '25%'
                    : `${Math.min(100, Math.round((readyVideoIds.size / Math.max(targetVideoIds.length, 1)) * 100))}%` 
                }}
              ></div>
            </div>
            <div className="text-[11px] text-gray-500 mt-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-twice-apricot animate-ping"></span>
              <span>Stabilizing multi-cam streams...</span>
            </div>
          </div>
        ) : (
          /* Ready-to-Play State with Prominent Play Button */
          <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
            <button 
              onClick={handleStartPlayback}
              className="group flex flex-col items-center gap-4 transition-transform active:scale-95 cursor-pointer outline-none"
              title="Start Synchronized Playback"
            >
              <div className="relative flex items-center justify-center">
                {/* Ambient breathing aura */}
                <div className="absolute w-28 h-28 rounded-full bg-gradient-to-tr from-twice-magenta via-pink-500 to-twice-apricot opacity-40 blur-2xl animate-pulse group-hover:opacity-80 transition-opacity" />
                
                {/* Glowing play circle */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-twice-magenta via-pink-500 to-twice-apricot p-1 shadow-[0_0_35px_rgba(255,25,136,0.5)] group-hover:shadow-[0_0_55px_rgba(255,25,136,0.8)] group-hover:scale-105 transition-all flex items-center justify-center">
                  <div className="w-full h-full rounded-full bg-slate-950/70 backdrop-blur-md flex items-center justify-center border border-white/30 group-hover:bg-slate-950/40 transition-colors">
                    <Play className="w-9 h-9 sm:w-11 sm:h-11 text-white fill-white ml-1.5 group-hover:scale-110 transition-transform" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-1.5 mt-2">
                <span className="text-white text-lg sm:text-2xl font-black tracking-wider uppercase group-hover:text-twice-apricot transition-colors">
                  START MULTI-CAM
                </span>
                <span className="text-xs sm:text-sm text-twice-apricot/90 font-bold tracking-wide">
                  {Math.max(targetVideoIds.length, 1)} Camera Angles Synchronized & Ready • Click to Play
                </span>
              </div>
            </button>
          </div>
        )}
      </div>

      {isDesktop ? (
        /* Desktop Seamless Mosaic Video Wall (>= 1024px) */
        <div 
          className="w-full relative bg-black select-none overflow-hidden group/player"
          onMouseEnter={() => setShowOverlay(true)}
          onMouseLeave={() => setShowOverlay(false)}
        >
          {/* Floating Top HUD Header */}
          <div 
            className={`absolute top-0 inset-x-0 z-30 px-4 py-3 bg-gradient-to-b from-black/95 via-black/70 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
              showOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 pr-2">
              <span className="bg-twice-magenta text-white px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 shadow">
                MASTER
              </span>
              <span className="text-white text-sm font-bold truncate">
                {masterVideo?.title}
              </span>
              {masterVideo?.songs?.[0]?.name && (
                <span className="text-twice-apricot text-xs font-semibold shrink-0">
                  • {masterVideo.songs[0].name}
                </span>
              )}
              {masterVideo?.members && masterVideo.members.length > 0 && (
                <span className="text-gray-400 text-xs truncate hidden sm:inline">
                  • {masterVideo.members.join(', ')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest hidden md:inline">
                {1 + activeSlaveVideos.length} ANGLES SYNCED
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGlobalMute();
                }}
                className="p-2 bg-black/80 hover:bg-black rounded-full border border-white/20 text-white transition-all hover:scale-105 active:scale-95"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-twice-apricot" />
                )}
              </button>
            </div>
          </div>

          {/* Seamless Mosaic Video Wall */}
          {activeSlaveVideos.length === 0 ? (
            /* Standalone Master Full-Width */
            <div className="aspect-video w-full relative bg-black">
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
          ) : activeSlaveVideos.length === 2 && !activeSlaveVideos.some(v => isVerticalVideo(v)) && !isVerticalVideo(masterVideo) ? (
            /* 3-Cam Panorama Mode: 3 horizontal angles side-by-side */
            <div className="grid grid-cols-3 gap-0.5 w-full bg-slate-950">
              <div className="aspect-video relative bg-black w-full">
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
              {activeSlaveVideos.slice(0, 2).map(video => (
                <div 
                  key={`desktop-slave-trio-${video.id}`}
                  className="aspect-video relative bg-black w-full cursor-pointer group/tile"
                  onClick={() => setAsMaster(video.id)}
                >
                  <YouTube 
                    key={`slave-${video.id}`}
                    videoId={video.youtube_id} 
                    opts={getSlaveOpts(video)} 
                    onReady={(e) => handleReady(e, video.id)}
                    className="w-full h-full absolute inset-0 pointer-events-none"
                    iframeClassName="w-full h-full block"
                  />
                  <div className={`absolute inset-0 z-20 flex flex-col justify-between p-3 transition-opacity duration-300 bg-black/40 ${
                    showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                  } group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto`}>
                    <div className="flex justify-end">
                      <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-white/80 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-xs font-black shadow-lg flex items-center gap-1.5 transition-transform scale-95 group-hover/tile:scale-100">
                        <Maximize2 className="w-3.5 h-3.5" /> SET AS MASTER
                      </div>
                    </div>
                    <div className="text-white text-xs font-bold line-clamp-1 drop-shadow-md">
                      {video.title}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Split Video Wall: Master (Left 8 cols) + Side Slaves (Right 4 cols) */
            <div className="w-full flex flex-col space-y-0.5 bg-slate-950">
              <div className="grid grid-cols-12 gap-0.5 w-full bg-slate-950">
                {/* Master Column (8 cols) */}
                <div className="col-span-8 aspect-video relative bg-black w-full">
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

                {/* Right Slaves Column (4 cols) */}
                <div className="col-span-4 w-full h-full flex flex-col">
                  {activeSlaveVideos.length === 1 ? (
                    /* Exactly 1 Slave: Match Master height */
                    <div 
                      className="aspect-video relative bg-black w-full h-full cursor-pointer group/tile"
                      onClick={() => setAsMaster(activeSlaveVideos[0].id)}
                    >
                      <YouTube 
                        key={`slave-${activeSlaveVideos[0].id}`}
                        videoId={activeSlaveVideos[0].youtube_id} 
                        opts={getSlaveOpts(activeSlaveVideos[0])} 
                        onReady={(e) => handleReady(e, activeSlaveVideos[0].id)}
                        className="w-full h-full absolute inset-0 pointer-events-none"
                        iframeClassName="w-full h-full block"
                      />
                      <div className={`absolute inset-0 z-20 flex flex-col justify-between p-3 transition-opacity duration-300 bg-black/40 ${
                        showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                      } group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto`}>
                        <div className="flex justify-end">
                          <Link to={`/video/${activeSlaveVideos[0].id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-white/80 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <div className="bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-xs font-black shadow-lg flex items-center gap-1.5 transition-transform scale-95 group-hover/tile:scale-100">
                            <Maximize2 className="w-3.5 h-3.5" /> SET AS MASTER
                          </div>
                        </div>
                        <div className="text-white text-xs font-bold line-clamp-1 drop-shadow-md">
                          {activeSlaveVideos[0].title}
                        </div>
                      </div>
                    </div>
                  ) : activeSlaveVideos.slice(0, 2).some(v => isVerticalVideo(v)) ? (
                    /* Vertical Slaves: 2 Vertical side-by-side inside the 4-col width */
                    <div className="grid grid-cols-2 gap-0.5 w-full h-full bg-slate-950">
                      {activeSlaveVideos.slice(0, 2).map(video => (
                        <div 
                          key={`desktop-slave-vert-${video.id}`}
                          className="aspect-[9/16] relative bg-black w-full cursor-pointer group/tile"
                          onClick={() => setAsMaster(video.id)}
                        >
                          <YouTube 
                            key={`slave-${video.id}`}
                            videoId={video.youtube_id} 
                            opts={getSlaveOpts(video)} 
                            onReady={(e) => handleReady(e, video.id)}
                            className="w-full h-full absolute inset-0 pointer-events-none"
                            iframeClassName="w-full h-full block"
                          />
                          <div className={`absolute inset-0 z-20 flex flex-col justify-between p-2 transition-opacity duration-300 bg-black/40 ${
                            showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                          } group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto`}>
                            <div className="flex justify-end">
                              <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-white/80 transition-colors">
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <div className="bg-twice-apricot text-black px-2 py-1 rounded text-[10px] font-black shadow-lg flex items-center gap-1 transition-transform scale-95 group-hover/tile:scale-100">
                                <Maximize2 className="w-3 h-3" /> MASTER
                              </div>
                            </div>
                            <div className="text-white text-[10px] font-bold line-clamp-1 drop-shadow-md">
                              {video.title}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* 2 Horizontal Slaves: Stacked vertically (each 16:9) */
                    <div className="flex flex-col gap-0.5 w-full h-full bg-slate-950">
                      {activeSlaveVideos.slice(0, 2).map(video => (
                        <div 
                          key={`desktop-slave-stack-${video.id}`}
                          className="aspect-video relative bg-black w-full flex-1 cursor-pointer group/tile"
                          onClick={() => setAsMaster(video.id)}
                        >
                          <YouTube 
                            key={`slave-${video.id}`}
                            videoId={video.youtube_id} 
                            opts={getSlaveOpts(video)} 
                            onReady={(e) => handleReady(e, video.id)}
                            className="w-full h-full absolute inset-0 pointer-events-none"
                            iframeClassName="w-full h-full block"
                          />
                          <div className={`absolute inset-0 z-20 flex flex-col justify-between p-2.5 transition-opacity duration-300 bg-black/40 ${
                            showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                          } group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto`}>
                            <div className="flex justify-end">
                              <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-white/80 transition-colors">
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="bg-twice-apricot text-black px-2.5 py-1 rounded-md text-[11px] font-black shadow-lg flex items-center gap-1 transition-transform scale-95 group-hover/tile:scale-100">
                                <Maximize2 className="w-3 h-3" /> SET AS MASTER
                              </div>
                            </div>
                            <div className="text-white text-[11px] font-bold line-clamp-1 drop-shadow-md">
                              {video.title}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Angles (> 2 slaves) tiled seamlessly below in a bottom row */}
              {activeSlaveVideos.length > 2 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-0.5 w-full bg-slate-950">
                  {activeSlaveVideos.slice(2).map(video => {
                    const isVert = isVerticalVideo(video);
                    return (
                      <div 
                        key={`desktop-slave-extra-${video.id}`}
                        className={`relative bg-black w-full cursor-pointer group/tile ${isVert ? 'aspect-[9/16]' : 'aspect-video'}`}
                        onClick={() => setAsMaster(video.id)}
                      >
                        <YouTube 
                          key={`slave-${video.id}`}
                          videoId={video.youtube_id} 
                          opts={getSlaveOpts(video)} 
                          onReady={(e) => handleReady(e, video.id)}
                          className="w-full h-full absolute inset-0 pointer-events-none"
                          iframeClassName="w-full h-full block"
                        />
                        <div className={`absolute inset-0 z-20 flex flex-col justify-between p-2.5 transition-opacity duration-300 bg-black/40 ${
                          showOverlay ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        } group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto`}>
                          <div className="flex justify-end">
                            <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-white/80 transition-colors">
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <div className="bg-twice-apricot text-black px-2.5 py-1 rounded text-[10px] font-black shadow-lg flex items-center gap-1 transition-transform scale-95 group-hover/tile:scale-100">
                              <Maximize2 className="w-3 h-3" /> SET MASTER
                            </div>
                          </div>
                          <div className="text-white text-[10px] font-bold line-clamp-1 drop-shadow-md">
                            {video.title}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
