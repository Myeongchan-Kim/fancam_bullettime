import React from 'react';
import YouTube, { YouTubeEvent, YouTubeProps } from 'react-youtube';
import { Link } from 'react-router-dom';
import { Maximize2, ExternalLink } from 'lucide-react';
import { Video } from '../../types';

interface SlaveVideoTileProps {
  video: Video;
  opts: YouTubeProps['opts'];
  onReady: (e: YouTubeEvent, videoId: number) => void;
  onSelectMaster: (videoId: number) => void;
  aspectClass?: string;
  compact?: boolean;
  badgeText?: string;
}

export const SlaveVideoTile: React.FC<SlaveVideoTileProps> = ({
  video,
  opts,
  onReady,
  onSelectMaster,
  aspectClass = 'aspect-video',
  compact = false,
  badgeText = 'SET AS MASTER',
}) => {
  const [isTouchActive, setIsTouchActive] = React.useState(false);

  return (
    <div
      className={`${aspectClass} relative bg-black w-full group/tile`}
      onClick={() => setIsTouchActive((prev) => !prev)}
    >
      <YouTube
        key={`slave-${video.id}`}
        videoId={video.youtube_id}
        opts={opts}
        onReady={(e) => onReady(e, video.id)}
        className="w-full h-full absolute inset-0 pointer-events-none"
        iframeClassName="w-full h-full block"
      />
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between ${
          compact ? 'p-2' : 'p-2.5'
        } transition-opacity duration-200 bg-black/40 ${
          isTouchActive
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover/tile:opacity-100 group-hover/tile:pointer-events-auto'
        }`}
      >
        <div className="flex justify-end">
          <Link
            to={`/video/${video.id}`}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 bg-black/60 rounded hover:text-twice-apricot text-white/90 transition-colors"
            title="Open Video Details"
          >
            <ExternalLink className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </Link>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectMaster(video.id);
            }}
            className={`bg-twice-apricot text-black ${
              compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
            } rounded-lg font-black shadow-lg flex items-center gap-1 transition-transform scale-95 group-hover/tile:scale-100 active:scale-95 cursor-pointer`}
          >
            <Maximize2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} /> {badgeText}
          </button>
        </div>
        <div className={`text-white ${compact ? 'text-[10px]' : 'text-xs'} font-bold line-clamp-1 drop-shadow-md`}>
          {video.title}
        </div>
      </div>
    </div>
  );
};
