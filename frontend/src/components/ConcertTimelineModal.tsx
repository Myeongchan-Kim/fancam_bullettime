import React from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Music } from 'lucide-react';
import { Concert } from '../types';

interface ConcertTimelineModalProps {
  concert: Concert;
  onClose: () => void;
}

const ConcertTimelineModal: React.FC<ConcertTimelineModalProps> = ({ concert, onClose }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Use createPortal to render the modal at the document root to avoid parent clipping/z-index issues
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="space-y-1">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Master Timeline</h2>
            <p className="text-twice-magenta font-bold text-xs uppercase tracking-widest">{concert.city} - {new Date(concert.date).toLocaleDateString()}</p>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all text-gray-400 hover:text-white">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Timeline List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {concert.setlist && concert.setlist.length > 0 ? (
            concert.setlist.map((item, idx) => (
              <div key={item.id} className="group flex items-center gap-4 p-4 bg-slate-800/40 hover:bg-slate-800 border border-slate-800 hover:border-twice-magenta/30 rounded-2xl transition-all">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-[10px] font-black text-gray-500 group-hover:text-twice-magenta transition-colors">
                  #{ (idx + 1).toString().padStart(2, '0') }
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white truncate group-hover:text-twice-apricot transition-colors uppercase italic tracking-tight">
                    {item.event_name || item.song?.name || "Unknown Track"}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    {item.song?.is_solo && <span className="text-[8px] bg-twice-magenta/20 text-twice-magenta px-1.5 py-0.5 rounded font-black uppercase">{item.song.member_name} Solo</span>}
                    {item.song?.name && !item.song.is_solo && <span className="text-[8px] bg-slate-700 text-gray-400 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1"><Music className="h-2 w-2" /> Song Tag</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-950 rounded-xl border border-white/5">
                  <Clock className="h-3 w-3 text-twice-magenta" />
                  <span className="text-sm font-black font-mono text-white leading-none pt-0.5">
                    {formatTime(item.start_time)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-20 text-gray-500 italic space-y-4">
               <Clock className="h-12 w-12 mx-auto opacity-10" />
               <p className="font-bold uppercase tracking-widest text-xs opacity-50">No timeline data available for this concert yet.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-950/50 border-t border-slate-800 text-center">
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic">Timeline data is used for precise multi-angle synchronization.</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConcertTimelineModal;
