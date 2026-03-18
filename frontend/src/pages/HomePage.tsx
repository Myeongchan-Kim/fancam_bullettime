import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Search, MapPin, Music, User, Compass, Play, ExternalLink, X, ShieldCheck } from 'lucide-react';

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  members: string[];
  angle: string;
  coordinate_x?: number;
  coordinate_y?: number;
  song?: { name: string };
  concert?: { city: string, date: string };
}

interface Song { id: number; name: string; is_solo: boolean; }
interface Concert { id: number; city: string; date: string; }

const VideoPlayerModal = ({ video, onClose }: { video: Video, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="relative bg-slate-900 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black rounded-full text-white transition-colors">
          <X className="h-6 w-6" />
        </button>
        <div className="aspect-video bg-black">
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1`}
            title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
          ></iframe>
        </div>
        <div className="p-6 flex justify-between items-center bg-slate-900 border-t border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{video.title}</h2>
            <div className="flex gap-2 text-xs text-gray-400 font-bold uppercase tracking-wider">
              <span className="text-twice-magenta">{video.members.join(", ")}</span>
              <span>•</span>
              <span className="text-twice-apricot">{video.song?.name}</span>
            </div>
          </div>
          <Link to={`/video/${video.id}`} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg border border-slate-700">
            <ExternalLink className="h-4 w-4" /> Go to Wiki
          </Link>
        </div>
      </div>
    </div>
  );
};

const MiniVideoList = ({ title, videos, onPlay }: { title: string, videos: Video[], onPlay: (v: Video) => void }) => (
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

const InteractiveStageMap = ({ 
  videos,
  onPlayVideo 
}: { 
  videos: Video[],
  onPlayVideo: (v: Video) => void
}) => {
  const navigate = useNavigate();
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  
  const mainAngles = [
    { label: "North (Front)", rotation: 0 },
    { label: "East (Right)", rotation: 90 },
    { label: "South (Back)", rotation: 180 },
    { label: "West (Left)", rotation: 270 }
  ];

  return (
    <div className="flex flex-col items-center justify-center w-full transition-all overflow-visible">
      <div className="relative w-[45rem] aspect-square flex items-center justify-center overflow-visible" onClick={() => setActiveTooltip(null)}>
        {/* Outer Dial Ring Background */}
        <div className="absolute inset-0 rounded-full border-4 border-slate-900 shadow-[inset_0_0_120px_rgba(0,0,0,0.95)] scale-110 bg-slate-900/10 pointer-events-none"></div>
        
        {/* Decorative 360 Degree Ticks */}
        {[...Array(72)].map((_, i) => (
          <div key={i} className="absolute w-1 h-full flex flex-col justify-between py-1 pointer-events-none" style={{ transform: `rotate(${i * 5}deg)` }}>
            <div className={`w-0.5 ${i % 6 === 0 ? 'h-8 bg-slate-700' : 'h-4 bg-slate-800'} mx-auto opacity-50`}></div>
            <div className={`w-0.5 ${i % 6 === 0 ? 'h-8 bg-slate-700' : 'h-4 bg-slate-800'} mx-auto opacity-50`}></div>
          </div>
        ))}

        {/* Individual Video Coordinate Markers */}
        {videos.map((v) => {
          if (v.coordinate_x !== null && v.coordinate_y !== null && v.coordinate_x !== undefined && v.coordinate_y !== undefined) {
            const isOpen = activeTooltip === v.id;
            return (
              <div 
                key={`marker-${v.id}`}
                className="absolute z-50 -translate-x-1/2 -translate-y-1/2"
                style={{ 
                  left: `${v.coordinate_x * 100}%`, 
                  top: `${v.coordinate_y * 100}%` 
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  onClick={() => setActiveTooltip(isOpen ? null : v.id)}
                  className={`w-5 h-5 bg-twice-magenta rounded-full shadow-[0_0_15px_#FF1988] border-2 border-white/20 animate-pulse cursor-pointer hover:scale-125 transition-transform ${isOpen ? 'scale-125 ring-4 ring-twice-magenta/30' : ''}`}
                ></div>
                
                {isOpen && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 animate-in zoom-in-95 duration-200 bg-slate-900 border border-slate-700 w-64 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[60]">
                    <div className="relative aspect-video w-full group/thumb cursor-pointer overflow-hidden" onClick={() => onPlayVideo(v)}>
                      <img src={v.thumbnail_url} className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110" alt="" />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                        <Play className="h-12 w-12 text-white fill-white shadow-2xl drop-shadow-2xl" />
                      </div>
                      <div className="absolute top-2 left-2 flex gap-1">
                         {v.members?.slice(0, 2).map(m => (
                           <span key={m} className="bg-twice-magenta/90 text-white px-1.5 py-0.5 text-[8px] font-black rounded uppercase tracking-tighter shadow-lg">{m}</span>
                         ))}
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-bold text-white line-clamp-2 leading-tight">{v.title}</h4>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight italic opacity-70">{v.song?.name} • {v.concert?.city}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {onPlayVideo(v); setActiveTooltip(null);}}
                          className="flex-1 bg-twice-magenta hover:bg-twice-magenta/90 text-white text-[10px] font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-twice-magenta/20"
                        >
                          <Play className="h-3 w-3 fill-current" /> PLAY
                        </button>
                        <button 
                          onClick={() => navigate(`/video/${v.id}`)}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-700"
                        >
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

        {/* Main Directions (Static Indicators) */}
        {mainAngles.map((a) => (
          <div key={a.label} className="absolute inset-0 flex justify-center py-1 pointer-events-none" style={{ transform: `rotate(${a.rotation}deg)` }}>
            <div className="relative h-full flex flex-col items-center">
              <div className="w-1.5 h-10 bg-slate-800 rounded-full mt-4 opacity-50"></div>
            </div>
          </div>
        ))}

        {/* Optimized Stage with Precise PIT Layout */}
        <div className="relative w-[31rem] h-32 flex items-center justify-center scale-[1.1] z-10 pointer-events-none text-white">
          <div className="absolute w-full h-full bg-slate-700/80 rounded-lg shadow-2xl flex items-center justify-center border-2 border-slate-600/50 overflow-hidden">
            <span className="text-[12px] font-black tracking-[1.5em] uppercase opacity-30">Stage</span>
          </div>
          <div className="absolute top-0 right-12 w-32 h-20 bg-[#0f172a] border-2 border-slate-700 rounded-bl-2xl flex items-center justify-center text-[9px] text-gray-500 font-bold tracking-widest z-20 shadow-inner">PIT 2</div>
          <div className="absolute bottom-0 left-12 w-32 h-20 bg-[#0f172a] border-2 border-slate-700 rounded-tr-2xl flex items-center justify-center text-[9px] text-gray-500 font-bold tracking-widest z-20 shadow-inner">PIT 1</div>
        </div>
      </div>
    </div>
  );
};

const HomePage = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  
  const [selectedSong, setSelectedSong] = useState('');
  const [selectedConcert, setSelectedConcert] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);

  const members = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"];

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [selectedSong, selectedConcert, selectedMember]);

  const fetchInitialData = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        axios.get('http://localhost:8000/api/songs'),
        axios.get('http://localhost:8000/api/concerts')
      ]);
      setSongs(sRes.data);
      setConcerts(cRes.data);
    } catch (err) { console.error("Error fetching metadata", err); }
  };

  const fetchVideos = async () => {
    try {
      let url = 'http://localhost:8000/api/videos?';
      if (selectedSong) url += `song_id=${selectedSong}&`;
      if (selectedConcert) url += `concert_id=${selectedConcert}&`;
      if (selectedMember) url += `member=${selectedMember}&`;
      
      const res = await axios.get(url);
      setVideos(res.data);
    } catch (err) { console.error("Error fetching videos", err); }
  };

  return (
    <div className="space-y-12">
      {activeVideo && <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />}
      
      {/* Huge Interactive Map Section with Sidebar Lists */}
      <section className="flex flex-col items-center justify-center py-10 bg-slate-900/30 rounded-[3rem] border border-slate-800/50 shadow-2xl relative overflow-visible text-white">
        {/* Background Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-twice-magenta)_0%,_transparent_70%)] opacity-[0.03] pointer-events-none"></div>

        <div className="w-full max-w-[95rem] px-10 flex items-center justify-between gap-10 overflow-visible">
          {/* Left Sidebar: Recent */}
          <MiniVideoList title="Recently Added" videos={videos.slice(0, 6)} onPlay={setActiveVideo} />

          {/* Center Map */}
          <div className="flex-1 flex justify-center overflow-visible">
            <InteractiveStageMap 
              videos={videos} 
              onPlayVideo={setActiveVideo}
            />
          </div>

          {/* Right Sidebar: Trending */}
          <MiniVideoList title="Hot Choices" videos={videos.slice().reverse().slice(0, 6)} onPlay={setActiveVideo} />
        </div>
      </section>

      {/* Filter Bar (Independent Row) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-800/20 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm shadow-xl">
        {/* Concert Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest text-white">
            <MapPin className="h-3 w-3 text-twice-apricot" /> Venue & City
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer text-white"
            value={selectedConcert}
            onChange={(e) => setSelectedConcert(e.target.value)}
          >
            <option value="">All Concerts</option>
            {concerts.map(c => <option key={c.id} value={c.id} className="bg-slate-900">{c.city} - {new Date(c.date).toLocaleDateString()}</option>)}
          </select>
        </div>
        {/* Song Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest text-white">
            <Music className="h-3 w-3 text-twice-magenta" /> Performance Song
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer text-white"
            value={selectedSong}
            onChange={(e) => setSelectedSong(e.target.value)}
          >
            <option value="">All Songs</option>
            {songs.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>)}
          </select>
        </div>
        {/* Member Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest text-white">
            <User className="h-3 w-3 text-indigo-400" /> Focus Member
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer text-white"
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
          >
            <option value="">All Members</option>
            {members.map(m => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
          </select>
        </div>
      </div>

      {/* Video Grid Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <div className="w-1 h-6 twice-gradient rounded-full"></div>
            <span>{videos.length} Performances Found</span>
          </h2>
          <div className="flex gap-2">
            {/* Active Filters as Pills */}
            {(selectedSong || selectedConcert || selectedMember) && (
              <button onClick={() => {setSelectedSong(''); setSelectedConcert(''); setSelectedMember('');}} className="text-[10px] text-gray-500 hover:text-white underline font-bold uppercase tracking-tighter">Clear All</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-white">
          {videos.map(video => (
            <Link to={`/video/${video.id}`} key={video.id} className="group bg-slate-800/40 rounded-xl overflow-hidden border border-slate-800 hover:border-twice-magenta transition-all hover:shadow-lg hover:shadow-twice-magenta/10 cursor-pointer">
              <div className="aspect-video relative overflow-hidden">
                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100" />
                
                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                  {video.members?.slice(0, 3).map(m => (
                    <span key={m} className="bg-twice-magenta/90 text-white px-2 py-0.5 text-[8px] font-black rounded uppercase tracking-wider shadow-lg">{m}</span>
                  ))}
                  {video.members?.length > 3 && <span className="bg-black/60 text-white px-2 py-0.5 text-[8px] font-bold rounded">+{video.members.length - 3}</span>}
                </div>

                <div className="absolute bottom-2 left-2 flex gap-1">
                  {video.angle !== "Unknown" && (
                    <span className="bg-indigo-600/90 text-white px-2 py-0.5 text-[8px] font-black rounded flex items-center gap-1 shadow-lg">
                      <Compass className="h-2 w-2" /> {video.angle.split(' ')[0]}
                    </span>
                  )}
                </div>
                
                <div className="absolute inset-0 bg-twice-magenta/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ExternalLink className="h-10 w-10 text-white drop-shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300" />
                </div>
              </div>
              <div className="p-4 space-y-2 bg-slate-900/50">
                <h3 className="font-bold text-sm line-clamp-2 text-white group-hover:text-twice-apricot transition-colors leading-tight">{video.title}</h3>
                <div className="flex items-center text-[10px] text-gray-500 space-x-2 font-black uppercase tracking-tighter opacity-70">
                  <span className="truncate max-w-[100px]">{video.song?.name || 'Unknown Song'}</span>
                  <span className="opacity-30">•</span>
                  <span>{video.concert?.city || 'Unknown City'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        {videos.length === 0 && (
          <div className="text-center py-32 text-gray-600">
            <Music className="h-16 w-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-black uppercase tracking-widest opacity-50">No results found</p>
            <button onClick={() => {setSelectedSong(''); setSelectedConcert(''); setSelectedMember('');}} className="mt-4 text-xs text-twice-magenta font-bold hover:underline">Reset Filters</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
