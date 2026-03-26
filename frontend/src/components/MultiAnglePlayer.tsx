import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Maximize2, VolumeX, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Video } from '../types';

interface MultiAnglePlayerProps {
  videos: Video[];
}

const SYNC_THRESHOLD = 0.5; // seconds difference before forcing seek

const MultiAnglePlayer: React.FC<MultiAnglePlayerProps> = ({ videos }) => {
  const [masterId, setMasterId] = useState<number>(videos[0]?.id);
  const [players, setPlayers] = useState<{ [key: number]: YouTubePlayer }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentConcertTime, setCurrentConcertTime] = useState<number>(0);
  const syncInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const masterVideo = videos.find(v => v.id === masterId) || videos[0];
  
  // Slave videos that cover the current timeframe
  const slaveVideos = videos.filter(v => {
    if (v.id === masterId) return false;
    // Buffer for better UX: show if within 2 seconds of range
    const BUFFER = 2;
    if (!v.duration || v.duration === 0) return true; // Show always if duration unknown
    return currentConcertTime >= (v.sync_offset - BUFFER) && currentConcertTime <= (v.sync_offset + v.duration + BUFFER);
  });

  const handleReady = (e: YouTubeEvent, videoId: number) => {
    // Only store if the player and its iframe are valid
    if (e.target && e.target.getIframe()) {
      setPlayers(prev => ({ ...prev, [videoId]: e.target }));
    }
  };

  useEffect(() => {
    // Start sync loop
    syncInterval.current = setInterval(() => {
      if (!players[masterId]) return;
      
      const masterPlayer = players[masterId];
      if (!masterPlayer || typeof masterPlayer.getCurrentTime !== 'function' || !masterPlayer.getIframe()) return;

      const masterTime = masterPlayer.getCurrentTime();
      const masterOffset = masterVideo.sync_offset || 0;
      setCurrentConcertTime(masterTime + masterOffset);

      if (!isPlaying) return;

      slaveVideos.forEach(slave => {
        const slavePlayer = players[slave.id];
        if (slavePlayer && typeof slavePlayer.getCurrentTime === 'function' && slavePlayer.getIframe()) {
          const slaveTime = slavePlayer.getCurrentTime();
          const slaveOffset = slave.sync_offset || 0;
          
          // Calculate expected slave time based on absolute concert time
          // Concert Time = video_local_time + video_start_offset
          // targetSlaveTime + slaveOffset = masterTime + masterOffset
          const targetSlaveTime = masterTime + masterOffset - slaveOffset;
          
          // Avoid seeking before video is loaded or if negative target
          if (targetSlaveTime >= 0 && Math.abs(slaveTime - targetSlaveTime) > SYNC_THRESHOLD) {
            slavePlayer.seekTo(targetSlaveTime, true);
          }
        }
      });
    }, 500);

    return () => {
      if (syncInterval.current) clearInterval(syncInterval.current);
    };
  }, [players, isPlaying, masterId, slaveVideos, masterVideo]);

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
    const oldMasterPlayer = players[masterId];
    if (oldMasterPlayer && typeof oldMasterPlayer.pauseVideo === 'function' && oldMasterPlayer.getIframe()) {
      oldMasterPlayer.pauseVideo();
    }
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
    <div className="w-full rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col xl:flex-row bg-slate-950">
      {/* Master View (Left/Main) - Strict 2/3 width on large screens */}
      <div className="w-full xl:w-2/3 flex flex-col p-6 pr-0 xl:pr-6 border-b xl:border-b-0 xl:border-r border-slate-800 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-white flex items-center gap-2 truncate mr-4">
            <span className="bg-twice-magenta text-white px-2 py-1 rounded text-xs shrink-0">MASTER</span>
            <span className="truncate">{masterVideo?.title}</span>
          </h2>
          <Link 
            to={`/video/${masterVideo?.id}`} 
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-[10px] font-black transition-all shrink-0 border border-slate-700"
          >
            <ExternalLink className="h-3 w-3" /> WIKI
          </Link>
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
        <div className="mt-4 flex gap-4 text-xs text-gray-400 font-bold uppercase tracking-wider">
          <span className="text-twice-magenta">{masterVideo?.members?.join(", ") || 'No Members Tagged'}</span>
          <span>•</span>
          <span className="text-twice-apricot">
            {masterVideo?.songs && masterVideo.songs.length > 0 
              ? masterVideo.songs.map(s => s.name).join(', ') 
              : 'Unknown Song'}
          </span>
          <span>•</span>
          <span>Offset: {masterVideo?.sync_offset || 0}s</span>
        </div>
      </div>

      {/* Slave Views (Right/Sidebar) - Strict 1/3 width on large screens */}
      <div className="w-full xl:w-1/3 flex flex-col p-6 bg-slate-900/50 overflow-y-auto space-y-4 max-h-[600px] xl:max-h-none no-scrollbar min-w-0">
        <h3 className="text-sm font-black text-gray-500 tracking-widest uppercase mb-2">Sync Angles ({slaveVideos.length})</h3>
        
        {slaveVideos.map(video => (
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
                className="w-full h-full absolute inset-0 pointer-events-none" // Disable clicking on slave
              />
              {/* Overlay to catch clicks and prevent pausing the slave directly */}
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                 <div className="opacity-0 group-hover:opacity-100 bg-twice-apricot text-black px-3 py-1.5 rounded-lg text-xs font-black shadow-lg flex items-center gap-1 transition-transform scale-90 group-hover:scale-100">
                   <Maximize2 className="w-3 h-3" /> SET AS MASTER
                 </div>
              </div>
            </div>
            <div className="p-3">
              <div className="flex justify-between items-start gap-2">
                <h4 className="text-xs font-bold text-white line-clamp-1 flex-1">{video.title}</h4>
                <Link 
                  to={`/video/${video.id}`} 
                  onClick={(e) => e.stopPropagation()} 
                  className="p-1 hover:text-twice-apricot text-gray-500 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex justify-between items-center mt-1">
                 <span className="text-[9px] text-gray-500 font-bold">Offset: {video.sync_offset}s</span>
                 <VolumeX className="w-3 h-3 text-red-400 opacity-50" />
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

export default MultiAnglePlayer;
