import React, { useState, useEffect, useRef, useMemo } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Maximize2, VolumeX, ExternalLink } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Video } from '../types';

interface MultiAnglePlayerProps {
  videos: Video[];
}

const SYNC_THRESHOLD = 0.5; // seconds difference before forcing seek

const MultiAnglePlayer: React.FC<MultiAnglePlayerProps> = ({ videos }) => {
  const navigate = useNavigate();
  const [masterId, setMasterId] = useState<number>(videos[0]?.id);
  const [players, setPlayers] = useState<{ [key: number]: YouTubePlayer }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentConcertTime, setCurrentConcertTime] = useState<number>(0);
  const currentConcertTimeRef = useRef<number>(0);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync internal state when navigating between videos (e.g. clicking back/forward or promo/demote)
  useEffect(() => {
    if (videos[0]?.id && videos[0].id !== masterId) {
      setMasterId(videos[0].id);
      setIsPlaying(false);
    }
  }, [videos[0]?.id]);

  const masterVideo = videos.find(v => v.id === masterId) || videos[0];
  
  // Slave videos that cover the current timeframe
  const slaveVideos = useMemo(() => {
    return videos.filter(v => {
      if (v.id === masterId) return false;

      // Special Rule: Always show "Full Concert" videos as they are the backbone of syncing
      const t = v.title.toLowerCase();
      const isFullConcert = t.includes('full concert') || t.includes('full show') || t.includes('full live') || t.includes('full-concert');
      if (isFullConcert) return true;

      const effectiveDuration = (v.duration && v.duration > 0) ? v.duration : 9999; 
      const BUFFER = 5; 

      const hasStarted = currentConcertTime >= (v.sync_offset - BUFFER);      const hasEnded = currentConcertTime > (v.sync_offset + effectiveDuration + BUFFER);

      return hasStarted && !hasEnded;
    });
  }, [videos, masterId, currentConcertTime]);

  // Keep a ref to the latest slave videos for the stable interval loop
  const slaveVideosRef = useRef(slaveVideos);
  useEffect(() => {
    slaveVideosRef.current = slaveVideos;
  }, [slaveVideos]);

  const handleReady = (e: YouTubeEvent, videoId: number) => {
    if (e.target && e.target.getIframe()) {
      setPlayers(prev => ({ ...prev, [videoId]: e.target }));
    }
  };

  // Stable sync loop
  useEffect(() => {
    syncInterval.current = setInterval(() => {
      const masterPlayer = players[masterId];
      if (!masterPlayer || typeof masterPlayer.getCurrentTime !== 'function' || !masterPlayer.getIframe()) return;

      const masterTime = masterPlayer.getCurrentTime();
      const masterOffset = masterVideo?.sync_offset || 0;
      const newConcertTime = masterTime + masterOffset;
      
      currentConcertTimeRef.current = newConcertTime;
      setCurrentConcertTime(newConcertTime);

      if (!isPlaying) return;

      // Use the ref to get the latest visible slaves without restarting the interval
      slaveVideosRef.current.forEach(slave => {
        const slavePlayer = players[slave.id];
        if (slavePlayer && typeof slavePlayer.getCurrentTime === 'function' && slavePlayer.getIframe()) {
          const slaveTime = slavePlayer.getCurrentTime();
          const slaveOffset = slave.sync_offset || 0;
          const targetSlaveTime = masterTime + masterOffset - slaveOffset;
          
          if (targetSlaveTime >= 0 && Math.abs(slaveTime - targetSlaveTime) > SYNC_THRESHOLD) {
            slavePlayer.seekTo(targetSlaveTime, true);
          }
        }
      });
    }, 500);

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [players, isPlaying, masterId, masterVideo]); // Use .length to avoid frequent restarts

  // Handle player cleanup only on unmount
  useEffect(() => {
    return () => { setPlayers({}); };
  }, []);

  const handlePlay = (e: YouTubeEvent) => {
    // Ensure we only process events from the master player
    if (e.target === players[masterId]) {
      setIsPlaying(true);
      slaveVideos.forEach(slave => {
        const slavePlayer = players[slave.id];
        if (slavePlayer && typeof slavePlayer.playVideo === 'function' && slavePlayer.getIframe()) {
          slavePlayer.playVideo();
        }
      });
    }
  };

  const handlePause = (e: YouTubeEvent) => {
    if (e.target === players[masterId]) {
      setIsPlaying(false);
      slaveVideos.forEach(slave => {
        const slavePlayer = players[slave.id];
        if (slavePlayer && typeof slavePlayer.pauseVideo === 'function' && slavePlayer.getIframe()) {
          slavePlayer.pauseVideo();
        }
      });
    }
  };

  useEffect(() => {
    // Enforce audio routing: Master is unmuted, Slaves are muted
    Object.keys(players).forEach(idStr => {
      const id = parseInt(idStr);
      const player = players[id];
      if (player && typeof player.mute === 'function' && player.getIframe()) {
        if (id === masterId) {
          player.unMute();
        } else {
          player.mute();
        }
      }
    });
  }, [masterId, players]);

  const setAsMaster = (id: number) => {
    if (id === masterId) return;
    
    // Pause current master to avoid overlapping audio
    const oldMasterPlayer = players[masterId];
    if (oldMasterPlayer && typeof oldMasterPlayer.pauseVideo === 'function' && oldMasterPlayer.getIframe()) {
      oldMasterPlayer.pauseVideo();
    }

    // Crucial: Update URL first. This triggers VideoDetailPage to re-fetch,
    // which eventually updates MultiAnglePlayer's videos prop.
    navigate(`/video/${id}`, { replace: true });
    
    setMasterId(id);
    setIsPlaying(false);
  };

  const optsMaster = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1 as const,
      modestbranding: 1 as const,
      rel: 0 as const,
    },
  };

  const optsSlave = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0 as const,
      modestbranding: 1 as const,
      rel: 0 as const,
      controls: 0 as const, // Hide controls on slave to prevent user tampering
      disablekb: 1 as const,
    },
  };

  return (
    <div className="w-full rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950 p-4 xl:p-6">
      {/* ㅢ Layout Container: Grid on XL, Flex on mobile */}
      <div className="grid grid-cols-1 xl:grid-cols-4 xl:grid-rows-[auto_1fr] gap-4 xl:gap-6">
        
        {/* Master View (Top-Left) - Spans 3 columns */}
        <div className="xl:col-span-3 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-white flex items-center gap-2 truncate">
              <span className="bg-twice-magenta text-white px-2 py-1 rounded text-xs shrink-0">MASTER</span>
              <span className="truncate">{masterVideo?.title}</span>
            </h2>
          </div>
          <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-slate-800 relative group">
            {masterVideo && (
              <YouTube 
                key={`master-${masterVideo.id}`}
                videoId={masterVideo.youtube_id} 
                opts={optsMaster} 
                onReady={(e) => handleReady(e, masterVideo.id)}
                onPlay={handlePlay}
                onPause={handlePause}
                className="w-full h-full absolute inset-0"
              />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400 font-bold uppercase tracking-wider">
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

        {/* Side Slaves (Right Sidebar) - Spans the right-most column */}
        <div className="xl:col-span-1 xl:row-span-2 flex flex-col space-y-4 max-h-[600px] xl:max-h-[850px] overflow-y-auto no-scrollbar min-w-0">
          <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1 flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-800"></div>
            SIDE ANGLES
            <div className="h-px flex-1 bg-slate-800"></div>
          </h3>
          
          {slaveVideos.slice(0, 3).map(video => (
            <div 
              key={video.id} 
              className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-twice-apricot transition-colors group cursor-pointer relative"
              onClick={() => setAsMaster(video.id)}
            >
              <div className="aspect-video relative bg-black">
                <YouTube 
                  key={`slave-${video.id}`}
                  videoId={video.youtube_id} 
                  opts={optsSlave} 
                  onReady={(e) => handleReady(e, video.id)}
                  className="w-full h-full absolute inset-0 pointer-events-none"
                />
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                   <div className="opacity-0 group-hover:opacity-100 bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg flex items-center gap-1 transition-transform scale-90 group-hover:scale-100">
                     <Maximize2 className="w-3 h-3" /> SET AS MASTER
                   </div>
                </div>
              </div>
              <div className="p-3">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="text-[10px] font-bold text-white line-clamp-1 flex-1">{video.title}</h4>
                  <Link to={`/video/${video.id}`} onClick={(e) => e.stopPropagation()} className="p-1 hover:text-twice-apricot text-gray-500 transition-colors">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}

          {slaveVideos.length === 0 && (
            <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-2xl">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No Live Angles</span>
            </div>
          )}
        </div>

        {/* Bottom Slaves (Horizontal Flow) - Fills the space below Master */}
        {slaveVideos.length > 3 && (
          <div className="xl:col-span-3 flex flex-col space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-1 flex items-center gap-2">
              <div className="h-px flex-1 bg-slate-800"></div>
              ADDITIONAL ANGLES ({slaveVideos.length - 3})
              <div className="h-px flex-1 bg-slate-800"></div>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {slaveVideos.slice(3, 9).map(video => (
                <div 
                  key={video.id} 
                  className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-twice-apricot transition-colors group cursor-pointer relative"
                  onClick={() => setAsMaster(video.id)}
                >
                  <div className="aspect-video relative bg-black">
                    <YouTube 
                      key={`slave-${video.id}`}
                      videoId={video.youtube_id} 
                      opts={optsSlave} 
                      onReady={(e) => handleReady(e, video.id)}
                      className="w-full h-full absolute inset-0 pointer-events-none"
                    />
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                       <div className="opacity-0 group-hover:opacity-100 bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-[10px] font-black shadow-lg transition-transform scale-90 group-hover:scale-100">
                         SET MASTER
                       </div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <h4 className="text-[10px] font-bold text-white line-clamp-1 truncate">{video.title}</h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );

};

export default MultiAnglePlayer;
