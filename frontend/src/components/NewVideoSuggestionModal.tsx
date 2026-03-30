import React, { useState } from 'react';
import axios from 'axios';
import { X, Youtube, Send, Music, MapPin, Compass } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { Song, Concert } from '../types';

interface Props {
  songs: Song[];
  concerts: Concert[];
  onClose: () => void;
}

const NewVideoSuggestionModal: React.FC<Props> = ({ songs, concerts, onClose }) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [songIds, setSongIds] = useState<number[]>([]);
  const [concertId, setConcertId] = useState<number>(0);
  const [angle, setAngle] = useState('Unknown');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const angleOptions = [
    "Unknown",
    "North (Front)",
    "South (Back)",
    "East (Right)",
    "West (Left)",
    "Top",
    "Floor"
  ];

  const toggleSong = (s_id: number) => {
    setSongIds(prev => prev.includes(s_id) ? prev.filter(id => id !== s_id) : [...prev, s_id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ytIdMatch = url.match(/(?:v=|\/|embed\/|shorts\/|live\/|youtu\.be\/)([0-9A-Za-z_-]{11})/);
    if (!ytIdMatch) {
      alert('Please enter a valid YouTube video URL');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/contributions`, {
        suggested_url: url,
        suggested_title: title || undefined,
        suggested_song_ids: songIds.length > 0 ? songIds : null,
        suggested_concert_id: concertId || null,
        suggested_angle: angle
      });
      alert('Thank you! Your video suggestion has been submitted for review.');
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error submitting suggestion');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 uppercase tracking-tighter italic">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Youtube className="h-5 w-5 text-red-500" />
            </div>
            <span>Suggest New Fancam</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">YouTube URL *</label>
            <div className="relative">
              <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                required
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white shadow-inner"
                value={url} onChange={e => setUrl(e.target.value)} 
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1">Video Title (Optional)</label>
            <input 
              placeholder="TWICE FANCY Fancam 4K"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white shadow-inner"
              value={title} onChange={e => setTitle(e.target.value)} 
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                <MapPin className="h-3 w-3" /> Concert
              </label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white appearance-none cursor-pointer"
                value={concertId} onChange={e => setConcertId(parseInt(e.target.value))}>
                <option value="0">Unknown / Other</option>
                {concerts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.city} - {new Date(c.date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                <Compass className="h-3 w-3" /> Camera Angle
              </label>
              <select 
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white appearance-none cursor-pointer"
                value={angle} onChange={e => setAngle(e.target.value)}>
                {angleOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Music className="h-3 w-3" /> Linked Songs
            </label>
            <div className="flex flex-wrap gap-1.5 p-3 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner max-h-40 overflow-y-auto no-scrollbar">
              {songs.map(s => (
                <button type="button" key={s.id} onClick={() => toggleSong(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all uppercase tracking-tighter border ${songIds.includes(s.id) ? 'bg-twice-apricot text-black border-twice-apricot shadow-[0_0_10px_rgba(255,179,92,0.3)]' : 'bg-slate-900 text-gray-500 border-transparent hover:border-slate-700'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-twice-magenta hover:bg-twice-magenta/90 text-white font-black py-4 rounded-2xl flex justify-center items-center gap-3 transition-all shadow-xl shadow-twice-magenta/20 uppercase tracking-widest text-xs"
            >
              <Send className="h-5 w-5" />
              {isSubmitting ? 'PROCESSING...' : 'SUBMIT SUGGESTION'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewVideoSuggestionModal;