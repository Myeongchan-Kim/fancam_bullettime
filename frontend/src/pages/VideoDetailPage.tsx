import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Info, Clock, Send, Edit3, Save, X, Music, MapPin, Target, ShieldCheck, Check, Trash2, Type } from 'lucide-react';
import { Video, Song, Concert, Contribution } from '../types';
import { API_BASE_URL, TWICE_MEMBERS } from '../constants';
import StageMap from '../components/StageMap';
import MultiAnglePlayer from '../components/MultiAnglePlayer';
import ConcertTimelineModal from '../components/ConcertTimelineModal';

const VideoDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);

  
  // Admin State
  const [adminKey, setAdminKey] = useState(localStorage.getItem('admin_key') || '');
  const [isAdminMode, setIsAdminMode] = useState(!!localStorage.getItem('admin_key'));
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [previewContrib, setPreviewContrib] = useState<Contribution | null>(null);
  const [showTimelineInfo, setShowTimelineInfo] = useState(false);

  // Edit/Suggestion Shared State
  const [editData, setEditData] = useState({
    title: '',
    song_ids: [] as number[],
    concert_id: 0,
    members: [] as string[],
    coordinate_x: null as number | null,
    coordinate_y: null as number | null,
    sync_offset: 0,
    duration: 0
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchVideoDetail();
    fetchMetadata();
    fetchContributions();
  }, [id]);

  const fetchVideoDetail = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/videos/${id}`);
      setVideo(res.data);
      setEditData({
        title: res.data.title,
        song_ids: res.data.songs?.map((s: Song) => s.id) || [],
        concert_id: res.data.concert?.id || 0,
        members: res.data.members || [],
        coordinate_x: res.data.coordinate_x,
        coordinate_y: res.data.coordinate_y,
        sync_offset: res.data.sync_offset,
        duration: res.data.duration
      });

      if (res.data.concert?.id) {
        // Fetch all videos from the same concert to allow syncing any angle from the show
        const relatedRes = await axios.get(`${API_BASE_URL}/videos?concert_id=${res.data.concert.id}`);
        setRelatedVideos(relatedRes.data.filter((v: Video) => v.id !== parseInt(id!)));
      }    } catch (err) { console.error("Error fetching video detail", err); }
  };

  const fetchMetadata = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/songs`),
        axios.get(`${API_BASE_URL}/concerts`)
      ]);
      setSongs(sRes.data);
      setConcerts(cRes.data);
    } catch (err) { console.error("Error fetching metadata", err); }
  };

  const fetchContributions = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/videos/${id}/contributions`);
      setContributions(res.data);
    } catch (err) { console.error("Error fetching contributions", err); }
  };

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      await axios.patch(`${API_BASE_URL}/videos/${id}`, {
        title: editData.title,
        song_ids: editData.song_ids.length > 0 ? editData.song_ids : null,
        concert_id: editData.concert_id || null,
        members: editData.members,
        coordinate_x: editData.coordinate_x,
        coordinate_y: editData.coordinate_y,
        sync_offset: editData.sync_offset,
        duration: editData.duration
      }, { headers: { 'X-Admin-Key': adminKey } });
      setIsEditing(false);
      fetchVideoDetail();
    } catch (err) { alert("Error updating details"); }
    finally { setIsSubmitting(false); }
  };

  const handleSuggest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/videos/${id}/contributions`, {
        suggested_title: editData.title,
        suggested_song_ids: editData.song_ids.length > 0 ? editData.song_ids : null,
        suggested_concert_id: editData.concert_id || null,
        suggested_members: editData.members,
        suggested_coordinate_x: editData.coordinate_x,
        suggested_coordinate_y: editData.coordinate_y,
        suggested_sync_offset: editData.sync_offset,
        suggested_duration: editData.duration,
        suggested_angle: "Unknown"
      });
      alert("Contribution submitted! Thank you for improving the archive.");
      fetchContributions();
    } catch (err) { alert("Error submitting contribution"); }
    finally { setIsSubmitting(false); }
  };

  const handleApprove = async (cId: number) => {
    try {
      await axios.post(`${API_BASE_URL}/contributions/${cId}/approve`, {}, {
        headers: { 'X-Admin-Key': adminKey }
      });
      alert("Contribution approved!");
      fetchVideoDetail();
      fetchContributions();
      setPreviewContrib(null);
    } catch (err) { alert("Approve failed"); }
  };

  const handleDeleteContrib = async (cId: number) => {
    if (!window.confirm("Delete this contribution?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/contributions/${cId}`, {
        headers: { 'X-Admin-Key': adminKey }
      });
      fetchContributions();
      if (previewContrib?.id === cId) setPreviewContrib(null);
    } catch (err) { alert("Delete failed"); }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('admin_key', adminKey);
    setIsAdminMode(true);
    setShowAdminLogin(false);
  };

  const toggleMember = (m: string) => {
    setEditData(prev => ({
      ...prev,
      members: prev.members.includes(m) ? prev.members.filter(name => name !== m) : [...prev.members, m]
    }));
  };

  const toggleSong = (s_id: number) => {
    setEditData(prev => ({
      ...prev,
      song_ids: prev.song_ids.includes(s_id) ? prev.song_ids.filter(id => id !== s_id) : [...prev.song_ids, s_id]
    }));
  };

  if (!video) return <div className="text-center py-20 text-white">Loading video...</div>;

  return (
    <div className="space-y-8 text-white pb-20">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
          <span>Back to Gallery</span>
        </button>
        
        <button 
          onClick={() => isAdminMode ? (localStorage.removeItem('admin_key'), setIsAdminMode(false)) : setShowAdminLogin(true)}
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${isAdminMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-gray-500 hover:text-gray-300'}`}
        >
          <ShieldCheck className="h-3 w-3" />
          {isAdminMode ? 'Admin Mode On' : 'Admin Login'}
        </button>
      </div>

      {showAdminLogin && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-white">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl space-y-6">
            <h2 className="text-2xl font-bold text-center">Admin Access</h2>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input 
                type="password" 
                placeholder="Enter Admin Secret Key"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-twice-magenta text-white"
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAdminLogin(false)} className="flex-1 bg-slate-800 py-3 rounded-xl font-bold">Cancel</button>
                <button type="submit" className="flex-1 twice-gradient py-3 rounded-xl font-bold">Verify</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Angle Sync Player (Default View) */}
      <section className="animate-in fade-in zoom-in-95 duration-500">
        <MultiAnglePlayer videos={[video, ...relatedVideos].slice(0, 12)} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          
          {/* Metadata Display / Official Editor */}
          <div className="p-8 bg-slate-800/30 rounded-3xl border border-slate-800 space-y-6 relative shadow-xl">
            {!isEditing ? (
              <>
                <div className="flex justify-between items-start">
                  <h1 className="text-3xl font-black leading-tight tracking-tighter uppercase italic">{video.title}</h1>
                  {isAdminMode && (
                    <button onClick={() => setIsEditing(true)} className="p-3 bg-slate-700 hover:bg-twice-magenta rounded-xl transition-all text-white shadow-lg">
                      <Edit3 className="h-5 w-5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {video.members?.map(m => (
                    <span key={m} className="bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30 px-4 py-1.5 rounded-full font-black uppercase tracking-widest text-[10px] shadow-[0_0_15px_rgba(255,25,136,0.2)]">{m} Focus</span>
                  ))}
                  <span className="bg-slate-700/50 px-4 py-1.5 rounded-full flex items-center gap-2 font-bold text-gray-300 border border-white/5"><Music className="h-3.5 w-3.5 text-twice-apricot"/> {video.songs && video.songs.length > 0 ? video.songs.map(s => s.name).join(', ') : 'Unknown Song'}</span>
                  <span className="bg-slate-700/50 px-4 py-1.5 rounded-full flex items-center gap-2 font-bold text-gray-300 border border-white/5"><MapPin className="h-3.5 w-3.5 text-twice-apricot"/> {video.concert?.city || 'Unknown City'}</span>
                </div>
              </>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                  <h3 className="text-xl font-black flex items-center gap-2 tracking-tighter uppercase italic"><Edit3 className="h-5 w-5 text-twice-apricot"/> Official Editor</h3>
                  <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white transition-colors"><X className="h-6 w-6"/></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4 md:col-span-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Video Title</label>
                    <input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                      value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                  </div>
                  
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Music className="h-3 w-3"/> Mapped Songs</label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-inner max-h-40 overflow-y-auto">
                      {songs.map(s => (
                        <button key={s.id} onClick={(e) => { e.preventDefault(); toggleSong(s.id); }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-tighter ${editData.song_ids.includes(s.id) ? 'bg-twice-apricot text-black shadow-[0_0_10px_rgba(255,179,92,0.4)]' : 'bg-slate-800 text-gray-500 hover:bg-slate-700'}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2"><MapPin className="h-3 w-3"/> Concert Venue</label>
                    <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white appearance-none cursor-pointer"
                      value={editData.concert_id} onChange={e => setEditData({...editData, concert_id: parseInt(e.target.value)})}>
                      <option value="0">Unknown</option>
                      {concerts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.city} ({new Date(c.date).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Clock className="h-3 w-3"/> Concert Offset (sec)
                      {video.concert && video.concert.setlist && video.concert.setlist.length > 0 && (
                        <button onClick={() => setShowTimelineInfo(true)} className="p-1 hover:bg-slate-700 rounded transition-colors ml-1">
                          <Info className="h-3 w-3 text-twice-magenta" />
                        </button>
                      )}
                    </label>
                    <input type="number" step="0.01" min="-9999" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                      placeholder="e.g. -10.5 if starts earlier"
                      value={editData.sync_offset} onChange={(e) => setEditData({...editData, sync_offset: parseFloat(e.target.value) || 0})} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Clock className="h-3 w-3"/> Video Duration (sec)</label>
                    <input type="number" step="1" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                      value={editData.duration} onChange={(e) => setEditData({...editData, duration: parseFloat(e.target.value)})} />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Members Featured</label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-inner">
                      {TWICE_MEMBERS.map(m => (
                        <button key={m} onClick={() => toggleMember(m)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase ${editData.members.includes(m) ? 'bg-twice-magenta text-white shadow-[0_0_10px_#FF1988]' : 'bg-slate-800 text-gray-600 hover:bg-slate-700'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pt-4">
                  <button onClick={handleUpdate} disabled={isSubmitting}
                    className="w-full bg-twice-magenta hover:bg-twice-magenta/80 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-twice-magenta/20 uppercase tracking-widest">
                    <Save className="h-5 w-5"/> {isSubmitting ? 'Processing...' : 'Apply Official Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Public Wiki Contribution Form (Moved Below) */}
          <div className="bg-slate-800/20 rounded-3xl p-8 border border-slate-800 space-y-6 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black flex items-center space-x-3 uppercase tracking-tighter italic">
                <div className="p-2 bg-twice-magenta/20 rounded-lg">
                  <Info className="h-5 w-5 text-twice-magenta" />
                </div>
                <span>Improve the Archive</span>
              </h2>
            </div>
            
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-sm text-gray-500 italic leading-relaxed border-l-2 border-twice-magenta/30 pl-4 font-bold">Help us perfect the sync! Correct the title, add missing members, or pin the exact stage location on the map.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-black text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Type className="h-3 w-3"/> Suggested Title</label>
                  <input className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                    value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[11px] font-black text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Music className="h-3 w-3"/> Song Tags</label>
                  <div className="flex flex-wrap gap-1.5 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-inner max-h-40 overflow-y-auto">
                    {songs.map(s => (
                      <button key={s.id} onClick={(e) => { e.preventDefault(); toggleSong(s.id); }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase ${editData.song_ids.includes(s.id) ? 'bg-twice-apricot text-black' : 'bg-slate-800 text-gray-500 hover:bg-slate-700'}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-2"><MapPin className="h-3 w-3"/> Concert</label>
                  <select className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white appearance-none cursor-pointer"
                    value={editData.concert_id} onChange={e => setEditData({...editData, concert_id: parseInt(e.target.value)})}>
                    <option value="0">Unknown</option>
                    {concerts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.city} - {new Date(c.date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <Clock className="h-3 w-3"/> Concert Offset (sec)
                    {video.concert && video.concert.setlist && video.concert.setlist.length > 0 && (
                      <button onClick={() => setShowTimelineInfo(true)} className="p-1 hover:bg-slate-700 rounded transition-colors ml-1">
                        <Info className="h-3 w-3 text-twice-magenta" />
                      </button>
                    )}
                  </label>
                  <input type="number" step="0.01" min="-9999" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                    placeholder="e.g. -10.5 if starts earlier"
                    value={editData.sync_offset} onChange={(e) => setEditData({...editData, sync_offset: parseFloat(e.target.value) || 0})} />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-gray-600 uppercase tracking-widest ml-1 flex items-center gap-2"><Clock className="h-3 w-3"/> Video Duration (sec)</label>
                  <input type="number" step="1" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-twice-magenta text-white shadow-inner"
                    value={editData.duration} onChange={(e) => setEditData({...editData, duration: parseFloat(e.target.value)})} />
                </div>
              </div>

              <button 
                onClick={handleSuggest} 
                disabled={isSubmitting} 
                className="w-full twice-gradient py-4 rounded-2xl font-black text-sm flex items-center justify-center space-x-3 hover:opacity-90 transition-all shadow-xl shadow-twice-magenta/20 uppercase tracking-[0.2em]"
              >
                <Send className="h-5 w-5" /> 
                <span>{isSubmitting ? 'Sending...' : 'Publish Wiki Suggestion'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: Map & Admin Controls */}
        <div className="space-y-8">
          <div className="space-y-3">
             <label className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em] ml-1 flex items-center gap-2"><Target className="h-3 w-3 text-twice-magenta"/> Precise Stage Location</label>
             <StageMap 
              angle={previewContrib?.suggested_angle || video.angle} 
              x={previewContrib ? previewContrib.suggested_coordinate_x : editData.coordinate_x} 
              y={previewContrib ? previewContrib.suggested_coordinate_y : editData.coordinate_y}
              onPosSelect={(x, y) => {
                setEditData({...editData, coordinate_x: x, coordinate_y: y});
                setPreviewContrib(null);
              }}
              previewX={previewContrib?.suggested_coordinate_x}
              previewY={previewContrib?.suggested_coordinate_y}
              sizeClass="w-full"
              stageScale={0.45}
            />
          </div>

          {isAdminMode && contributions.filter(c => !c.is_processed).length > 0 && (
            <div className="bg-indigo-900/20 rounded-3xl p-6 border border-indigo-500/30 space-y-4 shadow-xl">
              <h2 className="text-lg font-black flex items-center space-x-2 text-indigo-400 uppercase italic tracking-tighter">
                <ShieldCheck className="h-5 w-5" />
                <span>Review Community Edits</span>
              </h2>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2 no-scrollbar text-white">
                {contributions.filter(c => !c.is_processed).map(c => (
                  <div 
                    key={c.id} 
                    onMouseEnter={() => setPreviewContrib(c)}
                    onMouseLeave={() => setPreviewContrib(null)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${previewContrib?.id === c.id ? 'bg-indigo-600/40 border-indigo-400 shadow-lg' : 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest">
                        {new Date(c.created_at).toLocaleDateString()} Suggestion
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={(e) => {e.stopPropagation(); handleApprove(c.id);}} className="p-1.5 bg-green-600 hover:bg-green-500 rounded-lg transition-colors shadow-md"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={(e) => {e.stopPropagation(); handleDeleteContrib(c.id);}} className="p-1.5 bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-md"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {c.suggested_title && c.suggested_title !== video.title && <div className="text-[10px] text-white font-bold leading-tight line-clamp-1">Title: {c.suggested_title}</div>}
                      {c.suggested_song_ids && c.suggested_song_ids.length > 0 && <div className="text-[10px] text-twice-apricot font-bold">Songs: {c.suggested_song_ids.map(id => songs.find(s => s.id === id)?.name).filter(Boolean).join(", ")}</div>}
                      {c.suggested_duration && <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Duration: {Math.floor(c.suggested_duration / 60)}m {Math.floor(c.suggested_duration % 60)}s</div>}
                      <div className="text-[9px] text-indigo-400 font-black tracking-widest uppercase">Pos: {c.suggested_coordinate_x?.toFixed(2)}, {c.suggested_coordinate_y?.toFixed(2)} | Sync: {c.suggested_sync_offset}s</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {showTimelineInfo && video.concert && (
        <ConcertTimelineModal concert={video.concert} onClose={() => setShowTimelineInfo(false)} />
      )}
    </div>
  );
};

export default VideoDetailPage;
