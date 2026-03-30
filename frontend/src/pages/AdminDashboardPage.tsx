import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Youtube, ShieldCheck, Clock, Hash, Type, MapPin } from 'lucide-react';
import { Video, Song, Concert } from '../types';
import { API_BASE_URL } from '../constants';
import SetlistSlider from '../components/SetlistSlider';

const AdminDashboardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [videos, setVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  
  const maxSongOrder = songs.length > 0 ? Math.max(...songs.map(s => s.order || 0)) : 1;
  const selectedConcert = searchParams.get('concert') || '';
  const shortsOnly = searchParams.get('shorts') === 'true';
  
  const activeConcertObj = useMemo(() => concerts.find(c => c.id.toString() === selectedConcert), [concerts, selectedConcert]);
  const effectiveMaxOrder = activeConcertObj?.setlist && activeConcertObj.setlist.length > 0 
    ? activeConcertObj.setlist.length 
    : maxSongOrder;

  const startOrder = parseInt(searchParams.get('start') || '1', 10) || 1;
  const endOrder = parseInt(searchParams.get('end') || effectiveMaxOrder.toString(), 10) || effectiveMaxOrder;
  const searchQuery = searchParams.get('q') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

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

    if (selectedConcert && activeConcertObj?.setlist) {
      const setlistInRange = activeConcertObj.setlist.filter(item => 
        item.display_order >= (startOrder - 1) && 
        item.display_order <= (endOrder - 1)
      );
      const validSongIds = setlistInRange.map(item => item.song_id).filter(id => id !== null);
      
      filtered = filtered.filter(v => {
        const matchesConcert = v.concert?.id?.toString() === selectedConcert;
        if (!matchesConcert) return false;
        const hasSongInRange = v.songs?.some(s => validSongIds.includes(s.id));
        const isUntagged = !v.songs || v.songs.length === 0;
        const showUntagged = endOrder >= effectiveMaxOrder;
        return hasSongInRange || (isUntagged && showUntagged);
      });
    } else if (!selectedConcert && songs.length > 0) {
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [selectedConcert, shortsOnly]);

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
    setIsLoading(true);
    try {
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

  const resetFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setLocalSearch('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-twice-magenta" />
          Admin Video Dashboard
        </h1>
        
        <div className="flex gap-4 items-center">
           <Link to="/" className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-colors">Back to Gallery</Link>
        </div>
      </div>

      <section className="bg-slate-900/50 rounded-[2.5rem] border border-slate-800/50 p-2 overflow-hidden shadow-2xl">
        <SetlistSlider 
          songs={songs} 
          concerts={concerts}
          selectedConcert={selectedConcert}
          onConcertChange={(val) => {
            setSearchParams(prev => {
              if (val) {
                prev.set('concert', val);
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
      </section>

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-gray-400">
            <div className="w-1 h-4 twice-gradient rounded-full"></div>
            <span>{isLoading ? 'Loading Data...' : `${filteredVideos.length} Records Total`}</span>
          </h2>
          
          <div className="flex-1 max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Filter table..." 
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-twice-magenta outline-none transition-all text-white placeholder-gray-600 shadow-inner"
            />
          </div>

          <div className="flex gap-4 items-center">
            <button 
              onClick={() => setSearchParams(prev => { shortsOnly ? prev.delete('shorts') : prev.set('shorts', 'true'); return prev; }, { replace: true })}
              className={`px-3 py-2 rounded-lg text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all border ${shortsOnly ? 'bg-red-600/20 text-red-500 border-red-500/50' : 'bg-slate-800/50 text-gray-500 border-slate-700 hover:text-white'}`}
            >
              <Youtube className="h-3.5 w-3.5" /> Shorts
            </button>
            {(selectedConcert || searchQuery || shortsOnly) && (
              <button onClick={resetFilters} className="text-[10px] text-gray-500 hover:text-white underline font-bold uppercase tracking-tighter">Reset</button>
            )}
          </div>
        </div>

        {/* Admin Table View */}
        <div className="bg-slate-900/30 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Hash className="inline h-3 w-3 mr-1"/> ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Youtube className="inline h-3 w-3 mr-1"/> YT ID</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Type className="inline h-3 w-3 mr-1"/> Title / Songs</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><MapPin className="inline h-3 w-3 mr-1"/> Concert</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Clock className="inline h-3 w-3 mr-1"/> Offset</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Clock className="inline h-3 w-3 mr-1"/> Duration</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredVideos.map((video) => (
                  <tr key={video.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4 text-xs font-mono text-gray-500">{video.id}</td>
                    <td className="px-6 py-4 text-xs font-mono">
                      <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-twice-magenta hover:underline flex items-center gap-1">
                        {video.youtube_id} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="text-xs font-bold text-white truncate">{video.title}</div>
                      <div className="text-[9px] text-gray-500 font-black uppercase mt-1 truncate">
                        {video.songs?.map(s => s.name).join(", ") || "Untagged"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-gray-300">{video.concert?.city || "---"}</div>
                      <div className="text-[9px] text-gray-600 font-bold uppercase">{video.concert?.date ? new Date(video.concert.date).toLocaleDateString() : ""}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-mono font-bold ${video.sync_offset !== 0 ? 'text-twice-apricot' : 'text-gray-600'}`}>
                        {video.sync_offset.toFixed(2)}s
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-gray-400">
                        {video.duration.toFixed(1)}s
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/video/${video.id}`} className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-twice-magenta rounded-lg text-[10px] font-black text-white transition-all uppercase tracking-widest shadow-md">
                        Edit <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredVideos.length === 0 && !isLoading && (
            <div className="py-20 text-center text-gray-600 italic">No matching records found.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
