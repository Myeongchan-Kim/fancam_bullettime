import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Search, User, ExternalLink, Compass, Youtube } from 'lucide-react';
import { Video, Song, Concert } from '../types';
import { API_BASE_URL, TWICE_MEMBERS } from '../constants';
import VideoPlayerModal from '../components/VideoPlayerModal';
import MiniVideoList from '../components/MiniVideoList';
import StageMap from '../components/StageMap';
import SetlistSlider from '../components/SetlistSlider';
import NewVideoSuggestionModal from '../components/NewVideoSuggestionModal';
import AdminPendingContributionsModal from '../components/AdminPendingContributionsModal';
import { ShieldCheck } from 'lucide-react';

const HomePage = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  
  const [selectedConcert, setSelectedConcert] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [startOrder, setStartOrder] = useState(1);
  const [endOrder, setEndOrder] = useState(1);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [showNewVideoModal, setShowNewVideoModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const adminKey = localStorage.getItem('admin_key') || '';

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (songs.length > 0 && endOrder === 1) {
      setEndOrder(songs.length);
    }
  }, [songs]);

  useEffect(() => {
    fetchVideos();
  }, [selectedConcert, selectedMember, startOrder, endOrder]);

  const fetchInitialData = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/songs`),
        axios.get(`${API_BASE_URL}/concerts`)
      ]);
      setSongs(sRes.data);
      setConcerts(cRes.data);
    } catch (err) { console.error("Error fetching metadata", err); }
  };

  const fetchVideos = async () => {
    try {
      let url = `${API_BASE_URL}/videos?`;
      if (selectedConcert) url += `concert_id=${selectedConcert}&`;
      if (selectedMember) url += `member=${selectedMember}&`;
      if (songs.length > 0) {
        url += `start_order=${startOrder}&end_order=${endOrder}&`;
      }
      
      const res = await axios.get(url);
      setVideos(res.data);
    } catch (err) { console.error("Error fetching videos", err); }
  };

  return (
    <div className="space-y-12">
      {activeVideo && <VideoPlayerModal video={activeVideo} onClose={() => setActiveVideo(null)} />}
      {showNewVideoModal && <NewVideoSuggestionModal songs={songs} concerts={concerts} onClose={() => setShowNewVideoModal(false)} />}
      {showAdminModal && <AdminPendingContributionsModal adminKey={adminKey} songs={songs} concerts={concerts} onClose={() => { setShowAdminModal(false); fetchVideos(); }} />}
      
      {/* Huge Interactive Map Section with Sidebar Lists */}
      <section className="flex flex-col items-center justify-center py-10 bg-slate-900/30 rounded-[3rem] border border-slate-800/50 shadow-2xl relative overflow-visible text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-twice-magenta)_0%,_transparent_70%)] opacity-[0.03] pointer-events-none"></div>

        <div className="w-full max-w-[95rem] px-10 flex items-center justify-between gap-10 overflow-visible">
          {/* Left Sidebar: Recent */}
          <MiniVideoList title="Recently Added" videos={videos.slice(0, 6)} onPlay={setActiveVideo} />

          {/* Center Map */}
          <div className="flex-1 flex justify-center overflow-visible">
            <StageMap 
              angle="Unknown"
              videos={videos} 
              onPlayVideo={setActiveVideo}
              sizeClass="w-[45rem]"
            />
          </div>

          {/* Right Sidebar: Trending */}
          <MiniVideoList title="Hot Choices" videos={videos.slice().reverse().slice(0, 6)} onPlay={setActiveVideo} />
        </div>

        {/* Setlist Range Slider at the bottom of Hero */}
        <div className="w-full mt-10 mb-20">
          <SetlistSlider 
            songs={songs} 
            concerts={concerts}
            selectedConcert={selectedConcert}
            onConcertChange={setSelectedConcert}
            startOrder={startOrder} 
            endOrder={endOrder} 
            onChange={(s, e) => {setStartOrder(s); setEndOrder(e);}} 
          />
        </div>
      </section>

      {/* Filter Bar (Simplified) */}
      <div className="flex justify-center bg-slate-800/20 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm shadow-xl text-white max-w-2xl mx-auto">
        {/* Member Filter */}
        <div className="space-y-2 text-white w-full max-w-md">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest text-white">
            <User className="h-3 w-3 text-indigo-400" /> Focus Member
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer text-white"
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
          >
            <option value="">All Members</option>
            {TWICE_MEMBERS.map(m => <option key={m} value={m} className="bg-slate-900">{m}</option>)}
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
          <div className="flex gap-4 items-center">
            {/* Active Filters as Pills */}
            {(selectedConcert || selectedMember || (songs.length > 0 && (startOrder !== 1 || endOrder !== songs.length))) && (
              <button onClick={() => {setSelectedConcert(''); setSelectedMember(''); setStartOrder(1); setEndOrder(songs.length);}} className="text-[10px] text-gray-500 hover:text-white underline font-bold uppercase tracking-tighter">Clear All Filters</button>
            )}
            {adminKey && (
              <button onClick={() => setShowAdminModal(true)} className="bg-green-600/20 text-green-400 hover:bg-green-600/40 hover:text-white border border-green-600/50 px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                <ShieldCheck className="h-4 w-4" /> Pending Reviews
              </button>
            )}
            <button onClick={() => setShowNewVideoModal(true)} className="bg-twice-magenta/20 text-twice-apricot hover:bg-twice-magenta/40 hover:text-white border border-twice-magenta/50 px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(255,25,136,0.3)]">
              <Youtube className="h-4 w-4" /> Suggest Fancam
            </button>
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
                  <span className="truncate max-w-[100px]">{video.songs && video.songs.length > 0 ? video.songs.map(s => s.name).join(', ') : 'Unknown Song'}</span>
                  <span className="opacity-30">•</span>
                  <span>{video.concert?.city || 'Unknown City'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        
        {videos.length === 0 && (
          <div className="text-center py-32 text-gray-600">
            <Search className="h-16 w-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-black uppercase tracking-widest opacity-50">No results found</p>
            <button onClick={() => {setSelectedConcert(''); setSelectedMember(''); setStartOrder(1); setEndOrder(songs.length);}} className="mt-4 text-xs text-twice-magenta font-bold hover:underline">Reset Filters</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
