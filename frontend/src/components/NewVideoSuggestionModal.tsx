import React, { useState } from 'react';
import axios from 'axios';
import { X, Youtube, Send } from 'lucide-react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSong = (s_id: number) => {
    setSongIds(prev => prev.includes(s_id) ? prev.filter(id => id !== s_id) : [...prev, s_id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      alert('Please enter a valid YouTube URL');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/contributions`, {
        suggested_url: url,
        suggested_title: title || undefined,
        suggested_song_ids: songIds.length > 0 ? songIds : null,
        suggested_concert_id: concertId || null
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" /> Suggest New Fancam
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">YouTube URL *</label>
            <input 
              required
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white"
              value={url} onChange={e => setUrl(e.target.value)} 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Video Title (Optional)</label>
            <input 
              placeholder="TWICE FANCY Fancam 4K"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white"
              value={title} onChange={e => setTitle(e.target.value)} 
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Songs (Optional)</label>
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-2 bg-slate-800 border border-slate-700 rounded-xl no-scrollbar">
              {songs.map(s => (
                <button type="button" key={s.id} onClick={() => toggleSong(s.id)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${songIds.includes(s.id) ? 'bg-twice-apricot text-black' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Concert (Optional)</label>
            <select 
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-twice-magenta outline-none text-white"
              value={concertId} onChange={e => setConcertId(parseInt(e.target.value))}>
              <option value="0">Unknown / Other</option>
              {concerts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.city} - {new Date(c.date).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-twice-magenta hover:bg-twice-magenta/90 text-white font-black py-4 rounded-xl flex justify-center items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Send className="h-5 w-5" />
              {isSubmitting ? 'SUBMITTING...' : 'SUBMIT FOR REVIEW'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewVideoSuggestionModal;