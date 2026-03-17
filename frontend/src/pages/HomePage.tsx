import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Search, MapPin, Music, User, Compass } from 'lucide-react';

interface Video {
  id: number;
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  members: string[];
  angle: string;
  song?: { name: string };
  concert?: { city: string, date: string };
}

interface Song { id: number; name: string; is_solo: boolean; }
interface Concert { id: number; city: string; date: string; }

const InteractiveStageMap = ({ selectedAngle, onAngleSelect }: { selectedAngle: string, onAngleSelect: (angle: string) => void }) => {
  const angles = [
    { label: "North (Front)", rotation: 0 },
    { label: "East (Right)", rotation: 90 },
    { label: "South (Back)", rotation: 180 },
    { label: "West (Left)", rotation: 270 }
  ];

  const getLineHighlight = (target: string) => 
    selectedAngle === target ? "bg-twice-magenta h-14 shadow-[0_0_20px_#FF1988]" : "bg-slate-800 h-10 hover:bg-twice-apricot";

  return (
    <div className="flex flex-col items-center justify-center w-full py-10 transition-all">
      <div className="relative w-80 h-80 flex items-center justify-center">
        {/* Outer Perimeter Ring */}
        <div className="absolute inset-0 rounded-full border border-slate-800/40 scale-110"></div>
        
        {/* 360 Degree Viewpoint Indicators (Radial Lines) */}
        {[...Array(12)].map((_, i) => (
          <div key={i} className="absolute w-1 h-full flex flex-col justify-between py-2 pointer-events-none" style={{ transform: `rotate(${i * 30}deg)` }}>
            <div className="w-px h-6 bg-slate-800/40 mx-auto"></div>
            <div className="w-px h-6 bg-slate-800/40 mx-auto"></div>
          </div>
        ))}

        {/* Large Interactive Direction Selectors */}
        {angles.map((a) => (
          <div key={a.label} className="absolute inset-0 flex justify-center py-2" style={{ transform: `rotate(${a.rotation}deg)` }}>
            <button 
              onClick={() => onAngleSelect(selectedAngle === a.label ? "" : a.label)}
              className={`w-3 rounded-full transition-all duration-300 cursor-pointer ${getLineHighlight(a.label)}`}
              title={a.label}
            ></button>
          </div>
        ))}

        {/* Massive Integrated Stage with Precise PIT Layout */}
        <div className="relative w-[28rem] h-32 flex items-center justify-center scale-150">
          {/* Main Huge Stage Body */}
          <div className="absolute w-full h-full bg-slate-700/80 rounded-lg shadow-2xl flex items-center justify-center border-2 border-slate-600/50 overflow-hidden">
            <span className="text-[12px] font-black tracking-[1.5em] uppercase opacity-30">Stage</span>
          </div>
          
          {/* PIT 2 (Top Right Cutout) - Moved slightly towards center */}
          <div className="absolute -top-1 right-8 w-24 h-16 bg-[#0f172a] border-2 border-slate-700 rounded-bl-xl flex items-center justify-center text-[8px] text-gray-500 font-bold tracking-widest z-20">
            GA PIT 2
          </div>
          
          {/* PIT 1 (Bottom Left Cutout) - Moved slightly towards center */}
          <div className="absolute -bottom-1 left-8 w-24 h-16 bg-[#0f172a] border-2 border-slate-700 rounded-tr-xl flex items-center justify-center text-[8px] text-gray-500 font-bold tracking-widest z-20">
            GA PIT 1
          </div>
        </div>
      </div>
      
      <div className="mt-14 text-[13px] text-gray-500 font-black uppercase tracking-[0.4em] opacity-60">
        {selectedAngle ? (
          <span className="text-twice-magenta animate-pulse tracking-[0.5em]">Viewing Angle: {selectedAngle}</span>
        ) : (
          "Tap a radial line to select viewpoint"
        )}
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
  const [selectedAngle, setSelectedAngle] = useState('');

  const members = ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"];

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [selectedSong, selectedConcert, selectedMember, selectedAngle]);

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
      if (selectedAngle) url += `angle=${encodeURIComponent(selectedAngle)}&`;
      
      const res = await axios.get(url);
      setVideos(res.data);
    } catch (err) { console.error("Error fetching videos", err); }
  };

  return (
    <div className="space-y-12">
      {/* Huge Interactive Map Section (Full Width) */}
      <section className="flex flex-col items-center justify-center space-y-8 py-10 bg-slate-900/30 rounded-[3rem] border border-slate-800/50 shadow-2xl relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-twice-magenta)_0%,_transparent_70%)] opacity-[0.03] pointer-events-none"></div>

        <div className="text-center space-y-3 relative z-10">
          <h1 className="text-5xl font-black uppercase tracking-tighter italic">
            <span className="text-white">THIS IS FOR</span> <br/>
            <span className="twice-text-gradient">WORLD TOUR</span>
          </h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Experience TWICE from every angle. Select a viewpoint on the map below.
          </p>
        </div>

        <div className="w-full max-w-2xl px-4 flex justify-center">
          <InteractiveStageMap selectedAngle={selectedAngle} onAngleSelect={setSelectedAngle} />
        </div>
      </section>

      {/* Filter Bar (Independent Row) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-800/20 p-6 rounded-3xl border border-slate-800/50 backdrop-blur-sm shadow-xl">
        {/* Concert Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest">
            <MapPin className="h-3 w-3 text-twice-apricot" /> Venue & City
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer"
            value={selectedConcert}
            onChange={(e) => setSelectedConcert(e.target.value)}
          >
            <option value="">All Concerts</option>
            {concerts.map(c => <option key={c.id} value={c.id}>{c.city} - {new Date(c.date).toLocaleDateString()}</option>)}
          </select>
        </div>
        {/* Song Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest">
            <Music className="h-3 w-3 text-twice-magenta" /> Performance Song
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer"
            value={selectedSong}
            onChange={(e) => setSelectedSong(e.target.value)}
          >
            <option value="">All Songs</option>
            {songs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {/* Member Filter */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-gray-500 uppercase ml-2 flex items-center gap-2 tracking-widest">
            <User className="h-3 w-3 text-indigo-400" /> Focus Member
          </label>
          <select 
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none transition-all appearance-none cursor-pointer"
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
          >
            <option value="">All Members</option>
            {members.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Video Grid Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <div className="w-1 h-6 twice-gradient rounded-full"></div>
            <span>{videos.length} Performances Found</span>
          </h2>
          <div className="flex gap-2">
            {/* Active Filters as Pills */}
            {selectedAngle && (
              <button onClick={() => setSelectedAngle('')} className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded-md hover:bg-indigo-600/40">
                Angle: {selectedAngle} ✕
              </button>
            )}
            {(selectedSong || selectedConcert || selectedMember) && (
              <button onClick={() => {setSelectedSong(''); setSelectedConcert(''); setSelectedMember(''); setSelectedAngle('')}} className="text-[10px] text-gray-500 hover:text-white underline">Clear All</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map(video => (
            <Link to={`/video/${video.id}`} key={video.id} className="group bg-slate-800/40 rounded-xl overflow-hidden border border-slate-800 hover:border-twice-magenta transition-all hover:shadow-lg hover:shadow-twice-magenta/10">
              <div className="aspect-video relative overflow-hidden">
                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100" />
                
                <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                  {video.members?.slice(0, 3).map(m => (
                    <span key={m} className="bg-twice-magenta/90 text-white px-2 py-0.5 text-[8px] font-bold rounded uppercase tracking-wider">
                      {m}
                    </span>
                  ))}
                  {video.members?.length > 3 && <span className="bg-black/60 text-white px-2 py-0.5 text-[8px] font-bold rounded">+{video.members.length - 3}</span>}
                </div>

                <div className="absolute bottom-2 left-2 flex gap-1">
                  {video.angle !== "Unknown" && (
                    <span className="bg-indigo-600/90 text-white px-2 py-0.5 text-[8px] font-bold rounded flex items-center gap-1">
                      <Compass className="h-2 w-2" /> {video.angle.split(' ')[0]}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-2">
                <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-twice-apricot transition-colors leading-tight">{video.title}</h3>
                <div className="flex items-center text-[10px] text-gray-500 space-x-2 font-medium">
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
            <p className="text-lg font-medium">No results matches your filters.</p>
            <p className="text-sm">Try selecting a different angle or clearing filters.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
