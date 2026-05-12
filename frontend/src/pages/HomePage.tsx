import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Compass, Youtube } from 'lucide-react';
import { Video, Song, Concert } from '../types';
import { API_BASE_URL } from '../constants';
import StageMap from '../components/StageMap';
import SetlistSlider from '../components/SetlistSlider';
import NewVideoSuggestionModal from '../components/NewVideoSuggestionModal';
import AdminPendingContributionsModal from '../components/AdminPendingContributionsModal';
import { ShieldCheck, PlayCircle, Star } from 'lucide-react';

const FEATURED_SYNC_VIDEOS = [
  { 
    id: 215, 
    title: 'MOVE LIKE THAT', 
    subtitle: 'Incheon 2025 (Momo Solo)', 
    img: 'https://i.ytimg.com/vi/jDc_VSUS3AI/hqdefault.jpg',
    angleCount: 5,
    extraImgs: ['https://i.ytimg.com/vi/jDc_VSUS3AI/1.jpg', 'https://i.ytimg.com/vi/jDc_VSUS3AI/2.jpg']
  },
  { 
    id: 597, 
    title: 'CHESS', 
    subtitle: 'Incheon 2025 (Dahyun Solo)', 
    img: 'https://i.ytimg.com/vi/FGhOm91Zjvw/hqdefault.jpg',
    angleCount: 4,
    extraImgs: ['https://i.ytimg.com/vi/FGhOm91Zjvw/1.jpg']
  },
  { 
    id: 1137, 
    title: 'Feel Special', 
    subtitle: 'Incheon 2025 (Momo & Sana)', 
    img: 'https://i.ytimg.com/vi/U6Fnd-6Lybk/hqdefault.jpg',
    angleCount: 6,
    extraImgs: ['https://i.ytimg.com/vi/U6Fnd-6Lybk/1.jpg', 'https://i.ytimg.com/vi/U6Fnd-6Lybk/2.jpg']
  },
  { 
    id: 43, 
    title: 'In my room', 
    subtitle: 'Incheon 2025 (Chaeyoung Solo)', 
    img: 'https://i.ytimg.com/vi/bjDt0qM9Xkw/hqdefault.jpg',
    angleCount: 3,
    extraImgs: ['https://i.ytimg.com/vi/UAE2ZC3ADSs/hqdefault.jpg'] // 46번 영상(UAE2ZC3ADSs) 썸네일로 교체
  },
];

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [videos, setVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  
  const maxSongOrder = songs.length > 0 ? Math.max(...songs.map(s => s.order || 0)) : 1;
  const selectedConcert = searchParams.get('concert') || '';
  const shortsOnly = searchParams.get('shorts') === 'true';
  
  // 🛡️ 콘서트별 가변적 최대 곡 수 계산
  const activeConcertObj = useMemo(() => concerts.find(c => c.id.toString() === selectedConcert), [concerts, selectedConcert]);
  const effectiveMaxOrder = activeConcertObj?.setlist && activeConcertObj.setlist.length > 0 
    ? activeConcertObj.setlist.length 
    : maxSongOrder;

  const startOrder = parseInt(searchParams.get('start') || '1', 10) || 1;
  const endOrder = parseInt(searchParams.get('end') || effectiveMaxOrder.toString(), 10) || effectiveMaxOrder;
  const searchQuery = searchParams.get('q') || '';

  const [showNewVideoModal, setShowNewVideoModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const [isLoading, setIsLoading] = useState(true);
  const adminKey = localStorage.getItem('admin_key') || '';

  // Local state for the input field to make it snappy
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Sync back from searchParams if they change externally (e.g. Back button, reset)
  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  // Debounced effect to sync localSearch TO searchParams
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch === searchQuery) return;
      setSearchParams(prev => {
        if (localSearch.trim()) prev.set('q', localSearch);
        else prev.delete('q');
        return prev;
      }, { replace: true });
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch, searchQuery, setSearchParams]);

  const filteredVideos = useMemo(() => {
    let filtered = videos;

    // 1. Song Order Filtering (Instant Frontend Logic)
    if (selectedConcert && activeConcertObj?.setlist) {
      // Concert Mode: Filter by display_order in that concert's setlist
      // Map setlist to song IDs for quick lookup
      const setlistInRange = activeConcertObj.setlist.filter(item => 
        item.display_order >= (startOrder - 1) && 
        item.display_order <= (endOrder - 1)
      );
      const validSongIds = setlistInRange.map(item => item.song_id).filter(id => id !== null);
      
      filtered = filtered.filter(v => {
        // Show if video's concert matches AND (it matches a song in range OR it has no song yet)
        const matchesConcert = v.concert?.id?.toString() === selectedConcert;
        if (!matchesConcert) return false;
        
        const hasSongInRange = v.songs?.some(s => validSongIds.includes(s.id));
        const isUntagged = !v.songs || v.songs.length === 0;
        
        // Show untagged only if the range includes "end" (logic carried over from backend)
        const showUntagged = endOrder >= effectiveMaxOrder;
        
        return hasSongInRange || (isUntagged && showUntagged);
      });
    } else if (!selectedConcert && songs.length > 0) {
      // Global Mode: Filter by song's global order
      filtered = filtered.filter(v => {
        const hasSongInRange = v.songs?.some(s => {
          const ord = s.order;
          return ord !== null && ord !== undefined && ord >= startOrder && ord <= endOrder;
        });
        const isUntagged = !v.songs || v.songs.length === 0;
        const showUntagged = endOrder >= effectiveMaxOrder;
        
        return hasSongInRange || (isUntagged && showUntagged);
      });
    }

    // 2. Text Search Filtering
    if (!searchQuery.trim()) return filtered;
    const lowerQuery = searchQuery.toLowerCase();
    return filtered.filter(v => {
      return (
        v.youtube_id?.toLowerCase().includes(lowerQuery) ||
        v.title?.toLowerCase().includes(lowerQuery) ||
        v.concert?.city?.toLowerCase().includes(lowerQuery) ||
        v.concert?.venue?.toLowerCase().includes(lowerQuery) ||
        v.songs?.some(s => s.name.toLowerCase().includes(lowerQuery))
      );
    });
  }, [videos, searchQuery, selectedConcert, startOrder, endOrder, effectiveMaxOrder, activeConcertObj, songs.length]);

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setLocalSearch(''); // Clear local input immediately
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    // 1. Try to load from LocalStorage for instant render
    const cached = localStorage.getItem('home_summary_cache');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setSongs(data.songs || []);
        setConcerts(data.concerts || []);
        setVideos(data.videos || []);
        setIsLoading(false);
        console.log("⚡ Instant render from cache");
      } catch (e) {
        console.error("Cache parse error", e);
      }
    }

    // 2. Fetch fresh data from optimized summary endpoint
    try {
      const res = await axios.get(`${API_BASE_URL}/home/summary`);
      const data = res.data;
      
      setSongs(data.songs);
      setConcerts(data.concerts);
      setVideos(data.videos);
      setIsLoading(false);
      
      // Update cache
      localStorage.setItem('home_summary_cache', JSON.stringify(data));
      console.log("✨ Data refreshed from server");
    } catch (err) {
      console.error("Error fetching summary", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (songs.length > 0 && !searchParams.has('end')) {
      setSearchParams(prev => {
        prev.set('start', '1');
        prev.set('end', effectiveMaxOrder.toString());
        return prev;
      }, { replace: true });
    }
  }, [songs, searchParams, setSearchParams, effectiveMaxOrder]);

  useEffect(() => {
    // Only call fetchVideos if we are not in the initial mount phase where loadSummary is handling it
    if (songs.length === 0) return; 
    fetchVideos();
  }, [selectedConcert, shortsOnly]);

  useEffect(() => {
    setVisibleCount(12); // Reset scroll when dataset or search changes
  }, [videos, searchQuery, startOrder, endOrder]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredVideos.length) {
          setVisibleCount(prev => prev + 12);
        }
      },
      { threshold: 0, rootMargin: '200px' }
    );

    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [visibleCount, filteredVideos.length, isLoading]);

  const fetchVideos = async () => {
    setIsLoading(true);
    try {
      // If no filters are active, revert to the initial full list (via summary API)
      if (!selectedConcert && !shortsOnly) {
         // loadSummary does a full refresh, but we only need the videos array to reset.
         // We can just fetch /home/summary again or if we had a pure /videos endpoint for all.
         const res = await axios.get(`${API_BASE_URL}/home/summary`);
         setVideos(res.data.videos);
         return;
      }

      let url = `${API_BASE_URL}/videos?`;
      if (selectedConcert) url += `concert_id=${selectedConcert}&`;
      if (shortsOnly) url += `shorts_only=true&`;
      
      const res = await axios.get(url);
      setVideos(res.data);
    } catch (err) { 
      console.error("Error fetching videos", err); 
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {showNewVideoModal && <NewVideoSuggestionModal songs={songs} concerts={concerts} onClose={() => setShowNewVideoModal(false)} />}
      {showAdminModal && <AdminPendingContributionsModal adminKey={adminKey} songs={songs} concerts={concerts} onClose={() => { setShowAdminModal(false); fetchVideos(); }} />}

      {/* Huge Interactive Map Section with Sidebar Lists */}
      <section className="flex flex-col items-center justify-center py-10 bg-slate-900/30 rounded-[3rem] border border-slate-800/50 shadow-2xl relative overflow-visible text-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-twice-magenta)_0%,_transparent_70%)] opacity-[0.03] pointer-events-none"></div>

        <div className="w-full max-w-[95rem] px-10 flex items-center justify-center overflow-visible">
          {/* Center Map */}
          <div className="flex-1 flex justify-center overflow-visible">
            <StageMap 
              angle="Unknown" 
              videos={videos} 
              sizeClass="w-full max-w-[45rem]"
            />
          </div>
        </div>
        {/* Setlist Range Slider at the bottom of Hero */}
        <div className="w-full mt-10 mb-20">
          <SetlistSlider 
            songs={songs} 
            concerts={concerts}
            selectedConcert={selectedConcert}
            onConcertChange={(val) => {
              setSearchParams(prev => {
                if (val) {
                  prev.set('concert', val);
                  // 🛡️ 콘서트 변경 시 필터 범위 초기화 (레이스 컨디션 및 범위 오류 방지)
                  prev.set('start', '1');
                  prev.delete('end'); 
                } else {
                  prev.delete('concert');
                  prev.set('start', '1');
                  prev.delete('end');
                }
                return prev;
              }, { replace: true });
            }}
            startOrder={startOrder} 
            endOrder={endOrder} 
            onChange={(s, e) => {
              setSearchParams(prev => {
                prev.set('start', s.toString());
                prev.set('end', e.toString());
                return prev;
              }, { replace: true });
            }} 
          />
        </div>
      </section>

      {/* Featured Multi-Angle Section */}
      {(!searchQuery && !selectedConcert) && (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              <h2 className="text-xl font-black text-white uppercase tracking-widest italic">Featured Multi-Angle Syncs</h2>
              <span className="hidden sm:inline-block text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded font-bold ml-2 border border-yellow-500/30">Editor's Pick</span>
            </div>
            <p className="hidden md:block text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Experience the perfect 360° stage
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURED_SYNC_VIDEOS.map((featured) => (
              <Link to={`/video/${featured.id}`} key={featured.id} className="group relative transition-all duration-300 block">
                {/* Neon Glow Hover Effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-twice-magenta/40 to-twice-apricot/40 rounded-3xl blur-md opacity-0 group-hover:opacity-100 transition duration-500"></div>

                <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-white/10 group-hover:border-twice-magenta/50 bg-slate-950 shadow-2xl transition-all duration-300 flex">
                  {/* Multi-Cam Grid Layout */}
                  {/* Left Side: Main Camera (Large) */}
                  <div className="flex-[1.5] relative overflow-hidden border-r border-white/10">
                    <img 
                      src={featured.img} 
                      alt={featured.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    {/* CAM Label */}
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-[8px] font-black text-white px-1.5 py-0.5 rounded border border-white/10 tracking-widest uppercase">Cam 01</div>
                  </div>

                  {/* Right Side: Alternative Angles (Stacked Vertically) */}
                  <div className="flex-1 flex flex-col">
                    {featured.extraImgs.slice(0, 2).map((extra, idx) => (
                      <div key={idx} className={`relative flex-1 overflow-hidden ${idx === 0 ? 'border-b border-white/10' : ''}`}>
                        <img 
                          src={extra} 
                          alt="" 
                          className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-110" 
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                        <div className="absolute top-1.5 left-1.5 bg-black/60 backdrop-blur-sm text-[7px] font-black text-white px-1.5 py-0.5 rounded border border-white/10 tracking-widest uppercase">Cam 0{idx + 2}</div>
                      </div>
                    ))}
                    {/* If only 1 extra image, fill the second slot with a placeholder or just use full height for the first one */}
                    {featured.extraImgs.length === 1 && (
                      <div className="flex-1 bg-slate-900 flex items-center justify-center border-t border-white/10">
                        <Compass className="w-4 h-4 text-white/10" />
                      </div>
                    )}
                  </div>

                  {/* Global Overlays */}
                  <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 rounded-2xl z-20"></div>

                  {/* Multi-Angle Badge */}
                  <div className="absolute top-3 right-3 z-30">
                    <div className="bg-twice-magenta/90 backdrop-blur-md text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-lg flex items-center gap-1 border border-white/20">
                      <Compass className="h-3 w-3" />
                      {featured.angleCount} ANGLES
                    </div>
                  </div>

                  {/* Floating Play Button */}
                  <div className="absolute inset-0 flex items-center justify-center z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-white/10 backdrop-blur-md p-3 rounded-full border border-white/30 scale-75 group-hover:scale-100 transition-transform duration-500">
                      <PlayCircle className="w-8 h-8 text-white" />
                    </div>
                  </div>

                  {/* Bottom Text */}
                  <div className="absolute bottom-3 left-3 right-3 z-30 pointer-events-none">
                    <h3 className="text-white font-black text-sm uppercase tracking-tight leading-none group-hover:text-twice-magenta transition-colors drop-shadow-md">{featured.title}</h3>
                    <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest mt-1 truncate">{featured.subtitle}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>        </section>
      )}

      {/* Video Grid Section */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white min-w-max">
            <div className="w-1 h-6 twice-gradient rounded-full"></div>
            <span>{isLoading ? 'Searching...' : `${filteredVideos.length} Performances Found`}</span>
          </h2>
          
          {/* Real-time Text Filter */}
          <div className="flex-1 max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by title, location, or date..." 
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all text-white placeholder-gray-500 shadow-inner"
            />
          </div>

          <div className="flex gap-4 items-center flex-wrap justify-end">
            <button 
              onClick={() => setSearchParams(prev => { shortsOnly ? prev.delete('shorts') : prev.set('shorts', 'true'); return prev; }, { replace: true })}
              className={`px-4 py-2 rounded-xl text-xs font-black tracking-widest uppercase flex items-center gap-2 transition-all border ${shortsOnly ? 'bg-red-600/20 text-red-500 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-800/50 text-gray-500 border-slate-700 hover:text-white hover:border-slate-500'}`}
            >
              <Youtube className="h-4 w-4" /> Shorts Only
            </button>

            {/* Active Filters as Pills */}
            {(selectedConcert || searchQuery || shortsOnly || (songs.length > 0 && (startOrder !== 1 || endOrder !== effectiveMaxOrder))) && (
              <button onClick={resetFilters} className="text-[10px] text-gray-500 hover:text-white underline font-bold uppercase tracking-tighter">Clear All Filters</button>
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

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-12 h-12 border-4 border-twice-magenta/30 border-t-twice-magenta rounded-full animate-spin"></div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Loading Videos...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-white">
              {filteredVideos.slice(0, visibleCount).map(video => (
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
                      {video.is_shorts && (
                        <span className="bg-red-600/90 text-white px-2 py-0.5 text-[8px] font-black rounded flex items-center gap-1 shadow-lg">
                          <Youtube className="h-2 w-2" /> SHORTS
                        </span>
                      )}
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

            {/* Scroll Sentinel */}
            {filteredVideos.length > visibleCount && (
              <div id="scroll-sentinel" className="h-20 flex items-center justify-center">
                <div className="w-6 h-6 border-4 border-twice-magenta/30 border-t-twice-magenta rounded-full animate-spin"></div>
              </div>
            )}
            
            {filteredVideos.length === 0 && (
              <div className="text-center py-32 text-gray-600">
                <Search className="h-16 w-16 mx-auto mb-4 opacity-10" />
                <p className="text-lg font-black uppercase tracking-widest opacity-50">No results found</p>
                <button onClick={resetFilters} className="mt-4 text-xs text-twice-magenta font-bold hover:underline">Reset Filters</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default HomePage;
