import React from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import { Video } from '../types';

interface VideoPlayerModalProps {
  video: Video;
  onClose: () => void;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({ video, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="relative bg-slate-900 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black rounded-full text-white transition-colors">
          <X className="h-6 w-6" />
        </button>
        <div className="aspect-video bg-black">
          <iframe
            width="100%" height="100%"
            src={`https://www.youtube.com/embed/${video.youtube_id}?autoplay=1`}
            title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
          ></iframe>
        </div>
        <div className="p-6 flex justify-between items-center bg-slate-900 border-t border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{video.title}</h2>
            <div className="flex gap-2 text-xs text-gray-400 font-bold uppercase tracking-wider">
              <span className="text-twice-magenta">{video.members.join(", ")}</span>
              <span>•</span>
              <span className="text-twice-apricot">{video.songs && video.songs.length > 0 ? video.songs.map(s => s.name).join(', ') : 'Unknown Song'}</span>
            </div>
          </div>
          <Link to={`/video/${video.id}`} onClick={onClose} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg border border-slate-700">
            <ExternalLink className="h-4 w-4" /> Go to Wiki
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
