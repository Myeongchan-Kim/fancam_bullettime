import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Info, Compass, Clock, Send, PlayCircle, Edit3, Save, X, User, Music, MapPin, Target, ShieldCheck, Check, Trash2, Type } from 'lucide-react';

interface Contribution {
  id: number;
  video_id: number;
  suggested_title: string | null;
  suggested_song_id: number | null;
  suggested_concert_id: number | null;
  suggested_members: string[] | null;
  suggested_angle: string | null;
  suggested_coordinate_x: number | null;
  suggested_coordinate_y: number | null;
  suggested_sync_offset: number | null;
  is_processed: boolean;
  created_at: string;
}

interface VideoDetail {
  id: number;
  youtube_id: string;
  thumbnail_url: string;
  title: string;
  members: string[];
  angle: string;
  coordinate_x: number | null;
  coordinate_y: number | null;
  sync_offset: number;
  song?: { id: number, name: string };
  concert?: { id: number, city: string, date: string };
}

interface Song { id: number; name: string; is_solo: boolean; }
interface Concert { id: number; city: string; date: string; }

const StageMap = ({ 
  angle, 
  x, 
  y, 
  onPosSelect,
  previewX,
  previewY
}: { 
  angle: string, 
  x: number | null, 
  y: number | null,
  onPosSelect?: (x: number, y: number) => void,
  previewX?: number | null,
  previewY?: number | null
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  
  const mainAngles = [
    { label: "North (Front)", rotation: 0 },
    { label: "East (Right)", rotation: 90 },
    { label: "South (Back)", rotation: 180 },
    { label: "West (Left)", rotation: 270 }
  ];

  const getLineHighlight = (target: string) => 
    angle === target ? "bg-twice-magenta h-8 shadow-[0_0_10px_#FF1988] w-1" : "bg-slate-700 h-5 w-0.5";

  const handleMapClick = (e: React.MouseEvent) => {
    if (!onPosSelect || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;
    onPosSelect(clickX, clickY);
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4 mb-6 overflow-hidden">
      <h2 className="text-lg font-bold flex items-center space-x-2">
        <Compass className="h-5 w-5 text-indigo-400" />
        <span>Camera Position</span>
      </h2>
      
      <div className="relative flex items-center justify-center py-4 overflow-visible">
        <div 
          ref={mapRef}
          onClick={handleMapClick}
          className={`relative w-full aspect-square max-w-[280px] rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center overflow-visible shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] bg-slate-900/20 ${onPosSelect ? 'cursor-crosshair hover:bg-slate-700/20 transition-colors' : ''}`}
        >
          <div className="absolute inset-0 rounded-full border border-slate-800 scale-105 pointer-events-none"></div>

          {[...Array(36)].map((_, i) => (
            <div key={i} className="absolute w-1 h-full flex flex-col justify-between py-1 pointer-events-none" style={{ transform: `rotate(${i * 10}deg)` }}>
              <div className="w-0.5 h-2 bg-slate-800 mx-auto opacity-40"></div>
              <div className="w-0.5 h-2 bg-slate-800 mx-auto opacity-40"></div>
            </div>
          ))}

          {mainAngles.map((a) => (
            <div key={a.label} className="absolute inset-0 flex justify-center py-1 pointer-events-none" style={{ transform: `rotate(${a.rotation}deg)` }}>
              <div className={`rounded-full transition-all duration-300 ${getLineHighlight(a.label)}`}></div>
            </div>
          ))}

          {/* Official Position Marker */}
          {x !== null && y !== null && (
            <div 
              className="absolute z-40 pointer-events-none opacity-60"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            >
              <div className="w-4 h-4 bg-slate-400 rounded-full flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20">
                <Target className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          )}

          {/* Preview/Suggested Position Marker */}
          {(previewX !== undefined && previewY !== undefined && previewX !== null && previewY !== null) ? (
             <div 
              className="absolute z-50 pointer-events-none"
              style={{ left: `${previewX * 100}%`, top: `${previewY * 100}%` }}
            >
              <div className="w-5 h-5 bg-twice-magenta rounded-full shadow-[0_0_20px_#FF1988] flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20 animate-bounce">
                <Target className="w-3 h-3 text-white" />
              </div>
            </div>
          ) : (x !== null && y !== null && (
            <div 
              className="absolute z-50 pointer-events-none"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            >
              <div className="w-5 h-5 bg-twice-magenta rounded-full shadow-[0_0_20px_#FF1988] flex items-center justify-center -translate-x-1/2 -translate-y-1/2 border-2 border-white/20">
                <Target className="w-3 h-3 text-white" />
              </div>
            </div>
          ))}

          <div className="relative w-36 h-10 flex items-center justify-center scale-110 pointer-events-none z-10">
            <div className="absolute w-full h-full bg-slate-700/80 rounded-sm shadow-xl flex items-center justify-center border border-slate-600/50 overflow-hidden">
              <span className="text-[5px] font-black tracking-[0.5em] uppercase opacity-40">Stage</span>
            </div>
            <div className="absolute top-0 right-3 w-10 h-7 bg-slate-900 border border-slate-700 rounded-bl-md flex items-center justify-center text-[3px] text-gray-600 font-bold tracking-tighter z-20 shadow-inner">P2</div>
            <div className="absolute bottom-0 left-3 w-10 h-7 bg-slate-900 border border-slate-700 rounded-tr-md flex items-center justify-center text-[3px] text-gray-600 font-bold tracking-tighter z-20 shadow-inner">P1</div>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-gray-400 font-semibold border-t border-slate-700/50 pt-4">
        {onPosSelect ? (
          <span className="text-twice-apricot animate-pulse">Click map to pin exact location</span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Compass className="h-3 w-3" />
            {angle !== "Unknown" ? angle : "Location Unknown"}
          </span>
        )}
      </div>
    </div>
  );
};

const VideoDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<VideoDetail[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  
  // Admin State
  const [adminKey, setAdminKey] = useState(localStorage.getItem('admin_key') || '');
  const [isAdminMode, setIsAdminMode] = useState(!!localStorage.getItem('admin_key'));
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [previewContrib, setPreviewContrib] = useState<Contribution | null>(null);

  // Edit/Suggestion Shared State
  const [editData, setEditData] = useState({
    title: '',
    song_id: 0,
    concert_id: 0,
    members: [] as string[],
    coordinate_x: null as number | null,
    coordinate_y: null as number | null,
    sync_offset: 0
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const angles = ["North (Front)", "South (Back)", "East (Right)", "West (Left)", "Top", "Floor", "Unknown"];
  const allMembers = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"];

  useEffect(() => {
    fetchVideoDetail();
    fetchMetadata();
    fetchContributions();
  }, [id]);

  const fetchVideoDetail = async () => {
    try {
      const res = await axios.get(`http://localhost:8000/api/videos/${id}`);
      setVideo(res.data);
      setEditData({
        title: res.data.title,
        song_id: res.data.song?.id || 0,
        concert_id: res.data.concert?.id || 0,
        members: res.data.members || [],
        coordinate_x: res.data.coordinate_x,
        coordinate_y: res.data.coordinate_y,
        sync_offset: res.data.sync_offset
      });
      
      if (res.data.song?.id && res.data.concert?.id) {
        const relatedRes = await axios.get(`http://localhost:8000/api/videos?song_id=${res.data.song.id}&concert_id=${res.data.concert.id}`);
        setRelatedVideos(relatedRes.data.filter((v: VideoDetail) => v.id !== parseInt(id!)));
      }
    } catch (err) { console.error("Error fetching video detail", err); }
  };

  const fetchMetadata = async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        axios.get('http://localhost:8000/api/songs'),
        axios.get('http://localhost:8000/api/concerts')
      ]);
      setSongs(sRes.data);
      setConcerts(cRes.data);
    } catch (err) { console.error("Error fetching metadata", err); }
  };

  const fetchContributions = async () => {
    try {
      const res = await axios.get(`http://localhost:8000/api/videos/${id}/contributions`);
      setContributions(res.data);
    } catch (err) { console.error("Error fetching contributions", err); }
  };

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      await axios.patch(`http://localhost:8000/api/videos/${id}`, {
        title: editData.title,
        song_id: editData.song_id || null,
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
      await axios.post(`http://localhost:8000/api/videos/${id}/contributions`, {
        suggested_title: editData.title,
        suggested_song_id: editData.song_id || null,
        suggested_concert_id: editData.concert_id || null,
        suggested_members: editData.members,
        suggested_coordinate_x: editData.coordinate_x,
        suggested_coordinate_y: editData.coordinate_y,
        suggested_sync_offset: editData.sync_offset,
        suggested_angle: "Unknown" // Derived from coordinates ideally
      });
      alert("Contribution submitted! Thank you for improving the archive.");
      fetchContributions();
    } catch (err) { alert("Error submitting contribution"); }
    finally { setIsSubmitting(false); }
  };

  const handleApprove = async (cId: number) => {
    try {
      await axios.post(`http://localhost:8000/api/contributions/${cId}/approve`, {}, {
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
      await axios.delete(`http://localhost:8000/api/contributions/${cId}`, {
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

  if (!video) return <div className="text-center py-20">Loading video...</div>;

  return (
    <div className="space-y-6">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl space-y-6">
            <h2 className="text-2xl font-bold text-center">Admin Access</h2>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input 
                type="password" 
                placeholder="Enter Admin Secret Key"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-twice-magenta"
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
              src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1&start=${Math.floor(video.sync_offset)}`}
              title="YouTube video player" frameBorder="0" allowFullScreen
            ></iframe>
          </div>
          
          <div className="p-6 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-4 relative">
            {!isEditing ? (
              <>
                <div className="flex justify-between items-start">
                  <h1 className="text-2xl font-bold leading-tight">{video.title}</h1>
                  {isAdminMode && (
                    <button onClick={() => setIsEditing(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {video.members?.map(m => (
                    <span key={m} className="bg-twice-magenta px-3 py-1 rounded-full font-bold">{m} Focus</span>
                  ))}
                  <span className="bg-slate-700 px-3 py-1 rounded-full flex items-center gap-1"><Music className="h-3 w-3"/> {video.song?.name || 'Unknown Song'}</span>
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
                    <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-twice-magenta"
                      value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Song</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none"
                        value={editData.song_id} onChange={e => setEditData({...editData, song_id: parseInt(e.target.value)})}>
                        <option value="0">Unknown</option>
                        {songs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Concert</label>
                      <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none"
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
                      {allMembers.map(m => (
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
          />

          {isAdminMode && contributions.filter(c => !c.is_processed).length > 0 && (
            <div className="bg-indigo-900/20 rounded-2xl p-6 border border-indigo-500/30 space-y-4">
              <h2 className="text-lg font-bold flex items-center space-x-2 text-indigo-400">
                <ShieldCheck className="h-5 w-5" />
                <span>Review Wiki Changes</span>
              </h2>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
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
                      {c.suggested_song_id && c.suggested_song_id !== video.song?.id && <div className="text-[10px] text-twice-apricot">Song: {songs.find(s => s.id === c.suggested_song_id)?.name}</div>}
                      {c.suggested_members && JSON.stringify(c.suggested_members) !== JSON.stringify(video.members) && <div className="text-[10px] text-twice-magenta">Members: {c.suggested_members.join(", ")}</div>}
                      <div className="text-[10px] text-indigo-400">Pos: {c.suggested_coordinate_x?.toFixed(2)}, {c.suggested_coordinate_y?.toFixed(2)} | Sync: {c.suggested_sync_offset}s</div>
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
                  <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-twice-magenta"
                    value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><Music className="h-3 w-3"/> Song</label>
                  <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs outline-none"
                    value={editData.song_id} onChange={e => setEditData({...editData, song_id: parseInt(e.target.value)})}>
                    <option value="0">Unknown</option>
                    {songs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase ml-1 flex items-center gap-1"><MapPin className="h-3 w-3"/> Concert</label>
                  <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs outline-none"
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
                    {allMembers.map(m => (
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
                    <input type="number" step="0.1" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-twice-magenta"
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
            <h2 className="text-lg font-bold flex items-center space-x-2">
              <PlayCircle className="h-5 w-5 text-twice-apricot" />
              <span>Other Angles</span>
            </h2>
            <div className="space-y-3">
              {relatedVideos.length > 0 ? relatedVideos.map(rv => (
                <Link to={`/video/${rv.id}`} key={rv.id} className="flex items-center space-x-3 group bg-slate-900/50 p-2 rounded-lg hover:bg-slate-900 transition-colors border border-transparent hover:border-twice-apricot">
                  <div className="w-24 aspect-video flex-shrink-0 relative">
                    <img src={rv.thumbnail_url} className="w-full h-full object-cover rounded" alt="" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <PlayCircle className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-xs font-bold text-twice-apricot uppercase">{rv.angle}</p>
                    <p className="text-xs text-gray-300 truncate">{rv.title}</p>
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
