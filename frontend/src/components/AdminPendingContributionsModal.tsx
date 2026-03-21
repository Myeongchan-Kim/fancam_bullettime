import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ShieldCheck, Check, Trash2, Youtube } from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { Contribution, Song, Concert } from '../types';

interface Props {
  adminKey: string;
  songs: Song[];
  concerts: Concert[];
  videos: Video[];
  onClose: () => void;
}

const AdminPendingContributionsModal: React.FC<Props> = ({ adminKey, songs, concerts, videos, onClose }) => {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/contributions/pending`, {
        headers: { 'X-Admin-Key': adminKey }
      });
      setContributions(res.data);
    } catch (err) {
      console.error(err);
      alert('Failed to fetch pending contributions');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await axios.post(`${API_BASE_URL}/contributions/${id}/approve`, {}, {
        headers: { 'X-Admin-Key': adminKey }
      });
      alert('Approved!');
      fetchPending();
    } catch (err) {
      alert('Error approving');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this contribution?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/contributions/${id}`, {
        headers: { 'X-Admin-Key': adminKey }
      });
      fetchPending();
    } catch (err) {
      alert('Error deleting');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-500" /> Pending Video Suggestions
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <p className="text-center text-gray-500 py-10">Loading...</p>
          ) : contributions.length === 0 ? (
            <p className="text-center text-gray-500 py-10">No pending contributions.</p>
          ) : (
            contributions.map(c => (
              <div key={c.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {c.video_id ? (
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded uppercase truncate max-w-[200px]">
                        Edit: {videos.find(v => v.id === c.video_id)?.title || `#${c.video_id}`}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] font-bold rounded uppercase flex items-center gap-1"><Youtube className="w-3 h-3" /> New Fancam</span>
                    )}
                    <span className="text-[10px] text-gray-500">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  
                  {c.suggested_url && (
                    <a href={c.suggested_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-400 hover:underline block truncate">{c.suggested_url}</a>
                  )}
                  {c.suggested_title && <div className="text-xs text-white font-bold">Title: {c.suggested_title}</div>}
                  {c.suggested_song_ids && c.suggested_song_ids.length > 0 && <div className="text-xs text-twice-apricot">Songs: {c.suggested_song_ids.map(id => songs.find(s => s.id === id)?.name).filter(Boolean).join(", ")}</div>}
                  {c.suggested_concert_id && <div className="text-xs text-gray-300">Concert: {concerts.find(co => co.id === c.suggested_concert_id)?.city}</div>}
                  {c.suggested_members && c.suggested_members.length > 0 && <div className="text-xs text-twice-magenta">Members: {c.suggested_members.join(", ")}</div>}
                  {c.suggested_angle && <div className="text-xs text-indigo-400">Angle: {c.suggested_angle}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleApprove(c.id)} className="p-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold">
                    <Trash2 className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPendingContributionsModal;
