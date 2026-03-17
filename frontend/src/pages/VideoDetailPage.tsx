import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Info, Compass, Clock, Send, PlayCircle, Edit3, Save, X, User, Music, MapPin } from 'lucide-react';

interface VideoDetail {
  id: number;
  youtube_id: string;
  thumbnail_url: string;
  title: string;
  members: string[];
  angle: string;
  sync_offset: number;
  song?: { id: number, name: string };
  concert?: { id: number, city: string, date: string };
}

interface Song { id: number; name: string; is_solo: boolean; }
interface Concert { id: number; city: string; date: string; }

const StageMap = ({ angle }: { angle: string }) => {
  const getHighlightClass = (target: string) => 
    angle === target ? "bg-twice-magenta border-twice-magenta text-white shadow-[0_0_10px_#FF1988] z-10 scale-110" : "bg-slate-800 border-slate-600 text-gray-400";

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4 mb-6">
      <h2 className="text-lg font-bold flex items-center space-x-2">
        <Compass className="h-5 w-5 text-indigo-400" />
        <span>Camera Position</span>
      </h2>
      <div className="relative w-40 h-40 mx-auto mt-6 mb-4 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
        
        {/* Enriched Integrated Stage with Overlapping Pits */}
        <div className="relative w-36 h-16 flex items-center justify-center">
          {/* Main Long Stage Bar - Enlarged */}
          <div className="absolute w-32 h-6 bg-slate-700 rounded-sm z-10 flex items-center justify-center shadow-lg border border-slate-600/50">
            <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest">Stage</span>
          </div>
          
          {/* PIT 2 (Top Right Overlap) - Enlarged */}
          <div className="absolute top-0 right-0 w-16 h-10 bg-slate-800/80 border border-slate-700 rounded-sm flex items-end justify-center pb-1 text-[5px] text-gray-600 font-bold">PIT 2</div>
          
          {/* PIT 1 (Bottom Left Overlap) - Enlarged */}
          <div className="absolute bottom-0 left-0 w-16 h-10 bg-slate-800/80 border border-slate-700 rounded-sm flex items-start justify-center pt-1 text-[5px] text-gray-600 font-bold">PIT 1</div>
        </div>
        
        {/* Audience Sections */}
        <div className={`absolute top-0 -mt-3 text-[10px] px-2 py-1 rounded-full border font-bold transition-all ${getHighlightClass("North (Front)")}`}>
          N
        </div>
        <div className={`absolute bottom-0 -mb-3 text-[10px] px-2 py-1 rounded-full border font-bold transition-all ${getHighlightClass("South (Back)")}`}>
          S
        </div>
        <div className={`absolute right-0 -mr-3 text-[10px] px-2 py-1 rounded-full border font-bold transition-all ${getHighlightClass("East (Right)")}`}>
          E
        </div>
        <div className={`absolute left-0 -ml-3 text-[10px] px-2 py-1 rounded-full border font-bold transition-all ${getHighlightClass("West (Left)")}`}>
          W
        </div>
      </div>
      <div className="text-center text-xs text-gray-400 font-semibold">{angle !== "Unknown" ? angle : "Angle Unknown"}</div>
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
  
  // Suggestion/Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    song_id: 0,
    concert_id: 0,
    members: [] as string[]
  });
  
  const [suggestedAngle, setSuggestedAngle] = useState('');
  const [suggestedSync, setSuggestedSync] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const angles = ["North (Front)", "South (Back)", "East (Right)", "West (Left)", "Top", "Floor", "Unknown"];
  const allMembers = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"];

  useEffect(() => {
    fetchVideoDetail();
    fetchMetadata();
  }, [id]);

  const fetchVideoDetail = async () => {
    try {
      const res = await axios.get(`http://localhost:8000/api/videos/${id}`);
      setVideo(res.data);
      setSuggestedAngle(res.data.angle);
      setSuggestedSync(res.data.sync_offset);
      setEditData({
        title: res.data.title,
        song_id: res.data.song?.id || 0,
        concert_id: res.data.concert?.id || 0,
        members: res.data.members || []
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

  const handleUpdate = async () => {
    setIsSubmitting(true);
    try {
      await axios.patch(`http://localhost:8000/api/videos/${id}`, {
        title: editData.title,
        song_id: editData.song_id || null,
        concert_id: editData.concert_id || null,
        members: editData.members
      });
      setIsEditing(false);
      fetchVideoDetail();
    } catch (err) { alert("Error updating details"); }
    finally { setIsSubmitting(false); }
  };

  const handleSuggest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await axios.post(`http://localhost:8000/api/videos/${id}/suggestions`, {
        suggested_angle: suggestedAngle,
        suggested_sync_offset: suggestedSync
      });
      alert("Suggestion submitted!");
      fetchVideoDetail();
    } catch (err) { alert("Error submitting suggestion"); }
    finally { setIsSubmitting(false); }
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
      <button onClick={() => navigate(-1)} className="flex items-center text-gray-400 hover:text-white transition-colors">
        <ChevronLeft className="h-5 w-5" />
        <span>Back to Gallery</span>
      </button>

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
                  <button onClick={() => setIsEditing(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                    <Edit3 className="h-4 w-4" />
                  </button>
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
                  <h3 className="font-bold flex items-center gap-2"><Edit3 className="h-4 w-4 text-twice-apricot"/> Edit Video Details</h3>
                  <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white"><X className="h-5 w-5"/></button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Title</label>
                    <input className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-twice-magenta"
                      value={editData.title} onChange={e => setEditData({...editData, title: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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
                        {concerts.map(c => <option key={c.id} value={c.id}>{c.city}</option>)}
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
                <button onClick={handleUpdate} disabled={isSubmitting}
                  className="w-full bg-twice-apricot hover:bg-twice-apricot/80 text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-all">
                  <Save className="h-4 w-4"/> {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <StageMap angle={video.angle} />

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
                    <p className="text-[10px] text-gray-500">{rv.members?.join(", ")}</p>
                  </div>
                </Link>
              )) : (
                <p className="text-sm text-gray-500 italic">No other angles found yet.</p>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 space-y-4">
            <h2 className="text-lg font-bold flex items-center space-x-2">
              <Info className="h-5 w-5 text-twice-magenta" />
              <span>Wiki Contribution</span>
            </h2>
            <p className="text-xs text-gray-400">Help the community by labeling the camera angle and sync time!</p>
            <form onSubmit={handleSuggest} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 flex items-center space-x-1">
                  <Compass className="h-3 w-3" /> <span>Camera Angle</span>
                </label>
                <select className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-twice-magenta"
                  value={suggestedAngle} onChange={(e) => setSuggestedAngle(e.target.value)}>
                  {angles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 flex items-center space-x-1">
                  <Clock className="h-3 w-3" /> <span>Sync Offset (seconds)</span>
                </label>
                <input type="number" step="0.1" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-twice-magenta"
                  value={suggestedSync} onChange={(e) => setSuggestedSync(parseFloat(e.target.value))} placeholder="e.g. 15.5" />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full twice-gradient py-2 rounded-lg font-bold text-sm flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity disabled:opacity-50">
                <Send className="h-4 w-4" /> <span>{isSubmitting ? 'Submitting...' : 'Submit Suggestion'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDetailPage;
