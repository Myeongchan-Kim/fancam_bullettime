import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Info, Clock, Send, PlayCircle, Edit3, Save, X, User, Music, MapPin, Target, ShieldCheck, Check, Trash2, Type } from 'lucide-react';
import { Video, Song, Concert, Contribution } from '../types';
import { API_BASE_URL, TWICE_MEMBERS } from '../constants';
import StageMap from '../components/StageMap';
import MultiAnglePlayerModal from '../components/MultiAnglePlayerModal';

const VideoDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [showMultiAngle, setShowMultiAngle] = useState(false);
  
  // Admin State
  const [adminKey, setAdminKey] = useState(localStorage.getItem('admin_key') || '');
  const [isAdminMode, setIsAdminMode] = useState(!!localStorage.getItem('admin_key'));
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [previewContrib, setPreviewContrib] = useState<Contribution | null>(null);

  // Edit/Suggestion Shared State
  const [editData, setEditData] = useState({
    title: '',
    song_ids: [] as number[],
    concert_id: 0,
    members: [] as string[],
    coordinate_x: null as number | null,
    coordinate_y: null as number | null,
    sync_offset: 0
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
        sync_offset: res.data.sync_offset
      });

      if (res.data.songs?.length > 0 && res.data.concert?.id) {
        // Fetch related videos based on the first song for simplicity
        const relatedRes = await axios.get(`${API_BASE_URL}/videos?song_id=${res.data.songs[0].id}&concert_id=${res.data.concert.id}`);
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
        sync_offset: editData.sync_offset
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
    <div className="space-y-6 text-white">
      {showMultiAngle && video && (
        <MultiAnglePlayerModal 
          videos={[video, ...relatedVideos].slice(0, 4)} // Master + up to 3 slaves
          onClose={() => setShowMultiAngle(false)} 
        />
      )}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-white">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
            <iframe
              width="100%" height="100%"
              src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1`}
              title="YouTube video player" frameBorder="0" allowFullScreen
            ></iframe>
          </div>
          
          <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-4 relative">
            {!isEditing ? (
              <>
                <div className="flex justify-between items-start">
                  <h1 className="text-2xl font-bold leading-tight">{video.title}</h1>
                  {isAdminMode && (
                    <button onClick={() => setIsEditing(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-white">
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {video.members?.map(m => (
                    <span key={m} className="bg-twice-magenta px-3 py-1 rounded-full font-bold">{m} Focus</span>
                  ))}
                  <span className="bg-slate-700 px-3 py-1 rounded-full flex items-center gap-1"><Music className="h-3 w-3"/> {video.songs && video.songs.length > 0 ? video.songs.map(s => s.name).join(', ') : 'Unknown Song'}</span>
                  <span className="bg-slate-700 px-3 py-1 rounded-full flex items-center gap-1"><MapPin className="h-3 w-3"/> {video.concert?.city || 'Unknown City'}</span>
                </div>
              </>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <h3 className="font-bold flex items-center gap-2"><Edit3 className="h-4 w-4 text-twice-apricot"/> Official Editor</h3>
                  <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white"><X className="h-5 w-5"/></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Title</label>
                    <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-twice-magenta text-white"
                      value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Music className="h-3 w-3"/> Songs</label>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-slate-900 border border-slate-700 rounded-lg">
                        {songs.map(s => (
                          <button key={s.id} onClick={(e) => { e.preventDefault(); toggleSong(s.id); }}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${editData.song_ids.includes(s.id) ? 'bg-twice-apricot text-black' : 'bg-slate-800 text-gray-400 hover:bg-slate-700'}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><MapPin className="h-3 w-3"/> Concert</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs outline-none text-white"
                        value={editData.concert_id} onChange={e => setEditData({...editData, concert_id: parseInt(e.target.value)})}>
                        <option value="0">Unknown</option>
                        {concerts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.city}, {c.country} - {c.venue} ({new Date(c.date).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Members Focus</label>
                    <div className="flex flex-wrap gap-1">
                      {TWICE_MEMBERS.map(m => (
                        <button key={m} onClick={() => toggleMember(m)}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${editData.members.includes(m) ? 'bg-twice-magenta text-white' : 'bg-slate-900 text-gray-500 hover:bg-slate-700'}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleUpdate} disabled={isSubmitting}
                    className="flex-1 bg-twice-magenta hover:bg-twice-magenta/80 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all">
                    <Save className="h-4 w-4"/> {isSubmitting ? 'Saving...' : 'Save Official Details'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
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

          {isAdminMode && contributions.filter(c => !c.is_processed).length > 0 && (
            <div className="bg-indigo-900/20 rounded-2xl p-6 border border-indigo-500/30 space-y-4">
              <h2 className="text-lg font-bold flex items-center space-x-2 text-indigo-400">
                <ShieldCheck className="h-5 w-5" />
                <span>Review Wiki Changes</span>
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar text-white">
                {contributions.filter(c => !c.is_processed).map(c => (
                  <div 
                    key={c.id} 
                    onMouseEnter={() => setPreviewContrib(c)}
                    onMouseLeave={() => setPreviewContrib(null)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${previewContrib?.id === c.id ? 'bg-indigo-600/40 border-indigo-400' : 'bg-slate-900/50 border-slate-800 hover:border-indigo-500/50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-[10px] text-gray-400 font-mono">
                        {new Date(c.created_at).toLocaleDateString()} Suggestion
                      </div>
                      <div className="flex gap-1">
                        <button onClick={(e) => {e.stopPropagation(); handleApprove(c.id);}} className="p-1 bg-green-600 hover:bg-green-500 rounded-md transition-colors"><Check className="h-3 w-3" /></button>
                        <button onClick={(e) => {e.stopPropagation(); handleDeleteContrib(c.id);}} className="p-1 bg-red-600 hover:bg-red-500 rounded-md transition-colors"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {c.suggested_title && c.suggested_title !== video.title && <div className="text-[10px] text-white font-bold truncate">Title: {c.suggested_title}</div>}
                      {c.suggested_song_ids && c.suggested_song_ids.length > 0 && <div className="text-[10px] text-twice-apricot">Songs: {c.suggested_song_ids.map(id => songs.find(s => s.id === id)?.name).filter(Boolean).join(", ")}</div>}
                      {c.suggested_members && JSON.stringify(c.suggested_members) !== JSON.stringify(video.members) && <div className="text-[10px] text-twice-magenta">Members: {c.suggested_members.join(", ")}</div>}
                      <div className="text-[10px] text-indigo-400 font-bold">Pos: {c.suggested_coordinate_x?.toFixed(2)}, {c.suggested_coordinate_y?.toFixed(2)} | Sync: {c.suggested_sync_offset}s</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <Info className="h-5 w-5 text-twice-magenta" />
                <span>Wiki Contribution</span>
              </h2>
            </div>
            
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-xs text-gray-400 italic leading-relaxed">Fix crawler errors! Update title, members, song, or pin a precise location.</p>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Type className="h-3 w-3"/> Title</label>
                  <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-twice-magenta text-white"
                    value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Music className="h-3 w-3"/> Songs</label>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-slate-900 border border-slate-700 rounded-lg">
                      {songs.map(s => (
                        <button key={s.id} onClick={(e) => { e.preventDefault(); toggleSong(s.id); }}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${editData.song_ids.includes(s.id) ? 'bg-twice-apricot text-black' : 'bg-slate-800 text-gray-400 hover:bg-slate-700'}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><MapPin className="h-3 w-3"/> Concert</label>
                    <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs outline-none text-white"
                      value={editData.concert_id} onChange={e => setEditData({...editData, concert_id: parseInt(e.target.value)})}>
                      <option value="0">Unknown</option>
                      {concerts.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.city}, {c.country} - {c.venue} ({new Date(c.date).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><User className="h-3 w-3"/> Members</label>
                  <div className="flex flex-wrap gap-1">
                    {TWICE_MEMBERS.map(m => (
                      <button key={m} onClick={() => toggleMember(m)}
                        className={`px-2 py-1 rounded-md text-[9px] font-bold transition-all ${editData.members.includes(m) ? 'bg-twice-magenta text-white' : 'bg-slate-900 text-gray-500 hover:bg-slate-700'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Target className="h-3 w-3"/> Location</label>
                    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[10px] text-gray-500 font-mono">
                      {editData.coordinate_x ? `${editData.coordinate_x.toFixed(2)}, ${editData.coordinate_y?.toFixed(2)}` : '--'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Clock className="h-3 w-3"/> Sync (s)</label>
                    <input type="number" step="0.1" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-twice-magenta text-white"
                      value={editData.sync_offset} onChange={(e) => setEditData({...editData, sync_offset: parseFloat(e.target.value)})} />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSuggest} 
                disabled={isSubmitting} 
                className="w-full twice-gradient py-3 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 hover:opacity-90 transition-all shadow-lg shadow-twice-magenta/20"
              >
                <Send className="h-4 w-4" /> 
                <span>{isSubmitting ? 'Submitting...' : 'Submit Suggestion'}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center space-x-2 text-white">
                <PlayCircle className="h-5 w-5 text-twice-apricot" />
                <span>Other Angles</span>
              </h2>
              {relatedVideos.length > 0 && (
                <button 
                  onClick={() => setShowMultiAngle(true)}
                  className="bg-twice-magenta text-white px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-twice-magenta/80 transition-colors flex items-center gap-1 shadow-[0_0_10px_#FF1988]"
                >
                  <PlayCircle className="w-3 h-3" /> SYNC PLAY
                </button>
              )}
            </div>
            <div className="space-y-3">
              {relatedVideos.length > 0 ? relatedVideos.map(rv => (
                <Link to={`/video/${rv.id}`} key={rv.id} className="flex items-center space-x-3 group bg-slate-900/50 p-2 rounded-lg hover:bg-slate-900 transition-colors border border-transparent hover:border-twice-apricot text-white">
                  <div className="w-24 aspect-video flex-shrink-0 relative text-white">
                    <img src={rv.thumbnail_url} className="w-full h-full object-cover rounded" alt="" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayCircle className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-bold text-twice-apricot uppercase">{rv.angle}</p>
                    <p className="text-xs text-white truncate">{rv.title}</p>
                    <p className="text-[10px] text-gray-500">{rv.members?.join(", ")} Focus</p>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-gray-500 italic">No other angles found yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDetailPage;
