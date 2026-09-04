import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  GitBranch, Play, AlertTriangle, CheckCircle2, Split, 
  Search, RefreshCw, Calendar, Sparkles, AlertCircle,
  X, Volume2, Maximize2, ChevronDown
} from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { Concert, SyncGraphData, SyncGraphVideoNode } from '../types';

export default function SyncVisualizerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialConcertId = parseInt(searchParams.get('concert_id') || '2', 10);

  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState<number>(initialConcertId);
  const [graphData, setGraphData] = useState<SyncGraphData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'needs_fix' | 'verified' | 'segmented' | 'solos'>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active / Selected Video for Dedicated Right Player Panel
  const [selectedVideo, setSelectedVideo] = useState<SyncGraphVideoNode | null>(null);
  const [hoveredVideo, setHoveredVideo] = useState<SyncGraphVideoNode | null>(null);
  const [playerSeekTime, setPlayerSeekTime] = useState<number>(0);

  // Timeline zoom/scale (px per 100 seconds)
  const [scaleFactor, setScaleFactor] = useState<number>(18);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 1. Fetch Concerts list
  useEffect(() => {
    fetch(`${API_BASE_URL}/concerts`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        return res.json();
      })
      .then((data: Concert[]) => {
        if (Array.isArray(data)) {
          setConcerts(data);
          if (data.length > 0 && !selectedConcertId) {
            setSelectedConcertId(data[0].id);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load concerts', err);
        setConcerts([]);
      });
  }, []);

  // 2. Fetch Sync Graph Data
  const loadSyncGraph = (concertId: number) => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/concerts/${concertId}/sync-graph`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
        return res.json();
      })
      .then((data: SyncGraphData) => {
        setGraphData(data);
        if (data.videos && data.videos.length > 0 && !selectedVideo) {
          const master = data.videos.find(v => v.is_master) || data.videos[0];
          setSelectedVideo(master);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load sync graph', err);
        setError(err.message || 'Failed to load sync data');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (selectedConcertId) {
      setSearchParams({ concert_id: selectedConcertId.toString() });
      loadSyncGraph(selectedConcertId);
    }
  }, [selectedConcertId]);

  // Format seconds to HH:MM:SS
  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  };

  // Health stats
  const stats = useMemo(() => {
    if (!graphData || !graphData.videos) return { total: 0, verified: 0, segmented: 0, needsFix: 0 };
    const total = graphData.videos.length;
    const verified = graphData.videos.filter(v => v.status === 'verified' || v.status === 'master').length;
    const segmented = graphData.videos.filter(v => v.status === 'segmented').length;
    const needsFix = graphData.videos.filter(v => v.status === 'uncalibrated' || v.status === 'drift_warning').length;
    return { total, verified, segmented, needsFix };
  }, [graphData]);

  // Total Timeline Duration
  const totalDuration = useMemo(() => {
    if (!graphData || !graphData.master_video) return 11000;
    return Math.max(10800, graphData.master_video.duration || 10800);
  }, [graphData]);

  const canvasHeight = useMemo(() => {
    return Math.max(900, (totalDuration / 100) * scaleFactor);
  }, [totalDuration, scaleFactor]);

  // Simple Two-Tier Hierarchy:
  // 1. Parent Tracks (상위 캠: Master, Full Cams, Multi-Song/Split Cams)
  // 2. Child Tracks (하위 직캠: Solo stages & individual fancams)
  const { parentTracks, childTracks } = useMemo(() => {
    const parents: SyncGraphVideoNode[] = [];
    const children: SyncGraphVideoNode[] = [];

    if (!graphData || !graphData.videos) return { parentTracks: parents, childTracks: children };

    graphData.videos.forEach(v => {
      // Filter check
      if (statusFilter === 'needs_fix' && v.status !== 'uncalibrated' && v.status !== 'drift_warning') return;
      if (statusFilter === 'verified' && v.status !== 'verified' && v.status !== 'master') return;
      if (statusFilter === 'segmented' && v.status !== 'segmented') return;
      if (statusFilter === 'solos' && !v.songs.some(s => s.is_solo)) return;

      if (memberFilter !== 'all') {
        const hasMember = v.members && v.members.some(m => m.toLowerCase() === memberFilter.toLowerCase());
        const hasSoloMember = v.songs && v.songs.some(s => s.member_name?.toLowerCase() === memberFilter.toLowerCase());
        if (!hasMember && !hasSoloMember) return;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(q);
        const matchSong = v.songs.some(s => s.name.toLowerCase().includes(q));
        const matchMember = v.members.some(m => m.toLowerCase().includes(q));
        if (!matchTitle && !matchSong && !matchMember) return;
      }

      if (v.is_master || v.duration >= 600 || (v.segments && v.segments.length > 1)) {
        parents.push(v);
      } else {
        children.push(v);
      }
    });

    // Sort parents so Master is first, then longest duration
    parents.sort((a, b) => {
      if (a.is_master) return -1;
      if (b.is_master) return 1;
      return (b.duration || 0) - (a.duration || 0);
    });

    // Sort children by start time
    children.sort((a, b) => a.master_start_time - b.master_start_time);

    return { parentTracks: parents, childTracks: children };
  }, [graphData, statusFilter, memberFilter, searchQuery]);

  // Helper to calculate top & height in px
  const getPositionStyles = (startTime: number, duration: number) => {
    const top = (startTime / totalDuration) * canvasHeight;
    const height = Math.max(16, (duration / totalDuration) * canvasHeight);
    return { top: `${top}px`, height: `${height}px` };
  };

  const handleSelectVideo = (video: SyncGraphVideoNode, seekToMasterTime?: number) => {
    setSelectedVideo(video);
    if (seekToMasterTime !== undefined) {
      const localTime = Math.max(0, Math.floor(seekToMasterTime - video.sync_offset));
      setPlayerSeekTime(localTime);
    } else {
      setPlayerSeekTime(0);
    }
  };

  const allMembers = ['Nayeon', 'Jeongyeon', 'Momo', 'Sana', 'Jihyo', 'Mina', 'Dahyun', 'Chaeyoung', 'Tzuyu'];

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Sync Timeline Canvas
            </span>
            <span className="text-gray-400 text-xs font-mono">상위 풀캠 (좌측) ➔ 하위 직캠 (우측) • 얇은 바 타임라인</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            TWICE Concert Multi-Track Timeline
          </h1>
        </div>

        {/* Concert Selector */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedConcertId}
              onChange={(e) => setSelectedConcertId(parseInt(e.target.value, 10))}
              className="bg-slate-800 text-white pl-9 pr-8 py-2 rounded-xl border border-slate-700 text-xs font-bold focus:outline-none focus:border-twice-magenta appearance-none cursor-pointer hover:bg-slate-750 transition-all shadow-inner"
            >
              {concerts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.date ? new Date(c.date).toISOString().split('T')[0] : ''} {c.city} ({c.venue})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button 
            onClick={() => loadSyncGraph(selectedConcertId)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-xl border border-slate-700 transition-all shadow-sm"
            title="Refresh Sync Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-twice-magenta' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-xl border font-bold transition-all ${
            statusFilter === 'all' 
              ? 'bg-slate-800 text-white border-slate-600 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-white'
          }`}
        >
          전체 ({stats.total})
        </button>
        <button
          onClick={() => setStatusFilter('verified')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'verified' 
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-emerald-400'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> 정밀 일치 ({stats.verified})
        </button>
        <button
          onClick={() => setStatusFilter('segmented')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'segmented' 
              ? 'bg-amber-950/60 text-amber-300 border-amber-500/50 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-amber-400'
          }`}
        >
          <Split className="w-3.5 h-3.5 text-amber-400" /> 분할 Split ({stats.segmented})
        </button>
        <button
          onClick={() => setStatusFilter('needs_fix')}
          className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition-all ${
            statusFilter === 'needs_fix' 
              ? 'bg-rose-950/60 text-rose-300 border-rose-500/50 shadow-sm' 
              : 'bg-slate-900/60 text-gray-400 border-slate-800 hover:text-rose-400'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> 수정 필요 ({stats.needsFix})
        </button>
      </div>

      {/* Filter Toolbar & Zoom Scale Slider */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl backdrop-blur-sm">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="영상 제목, 곡명 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-700 focus:outline-none focus:border-twice-magenta placeholder-gray-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Member Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setMemberFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
              memberFilter === 'all'
                ? 'bg-twice-magenta text-white shadow-md'
                : 'bg-slate-800 text-gray-400 hover:text-white'
            }`}
          >
            전체 멤버
          </button>
          {allMembers.map(member => (
            <button
              key={member}
              onClick={() => setMemberFilter(member)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                memberFilter === member
                  ? 'bg-twice-apricot text-slate-950 font-black shadow-md'
                  : 'bg-slate-800 text-gray-400 hover:text-white'
              }`}
            >
              {member}
            </button>
          ))}
        </div>

        {/* Zoom Scale Controller */}
        <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-xl border border-slate-700 text-xs text-gray-300 font-mono">
          <span className="text-[10px]">Scale:</span>
          <input 
            type="range" 
            min="10" 
            max="40" 
            value={scaleFactor} 
            onChange={(e) => setScaleFactor(parseInt(e.target.value, 10))}
            className="w-16 accent-twice-magenta cursor-pointer"
          />
          <span className="w-6 text-right text-twice-apricot font-bold text-[10px]">{scaleFactor}</span>
        </div>
      </div>

      {/* Loading & Error */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <RefreshCw className="w-8 h-8 text-twice-magenta animate-spin mb-3" />
          <h3 className="text-sm font-bold text-white">타임라인 캔버스 로딩 중...</h3>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-950/30 border border-rose-500/40 p-5 rounded-2xl text-center">
          <AlertCircle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-rose-200">데이터를 불러오지 못했습니다</h3>
          <p className="text-rose-400 text-xs mt-1">{error}</p>
        </div>
      )}

      {/* ================= SIMPLIFIED DUAL-VIEW: Left Thin-Bar Canvas (8 Cols) + Right Pinned Player (4 Cols) ================= */}
      {!loading && !error && graphData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ================= LEFT MULTI-TRACK THIN-BAR CANVAS (8 COLS) ================= */}
          <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-md overflow-x-auto">
            
            {/* Track Column Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs font-mono sticky top-0 bg-slate-900/95 z-20 backdrop-blur">
              <div className="flex items-center gap-6">
                <div className="w-16 text-gray-500 font-bold">시간</div>
                <div className="text-purple-400 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> 상위 캠 (마스터 & 풀캠 {parentTracks.length}개)
                </div>
              </div>
              <div className="text-pink-400 font-bold flex items-center gap-1.5 pr-4">
                <GitBranch className="w-3 h-3" /> 하위 직캠 (개별 & 솔로 {childTracks.length}개)
              </div>
            </div>

            {/* Continuous Vertical Canvas Container */}
            <div 
              ref={timelineRef}
              style={{ height: `${canvasHeight}px` }} 
              className="relative w-full mt-4 flex gap-4"
            >
              {/* 1. Left Time Scale Axis (Every 15 minutes) */}
              <div className="w-16 relative h-full flex-shrink-0 border-r border-slate-800/80">
                {Array.from({ length: Math.ceil(totalDuration / 900) }).map((_, gIdx) => {
                  const sec = gIdx * 900;
                  const topPx = (sec / totalDuration) * canvasHeight;
                  return (
                    <div
                      key={gIdx}
                      style={{ top: `${topPx}px` }}
                      className="absolute left-0 right-0 border-t border-slate-800 flex items-center pointer-events-none"
                    >
                      <span className="text-[9px] font-mono text-gray-500 -mt-2">
                        {formatTime(sec)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 2. Parent Tracks (상위 캠: Thin Vertical Bars Side-by-Side) */}
              <div className="flex items-start gap-2.5 relative h-full flex-shrink-0 border-r border-slate-800/80 pr-4">
                {parentTracks.map((pCam) => {
                  const isSelected = selectedVideo?.id === pCam.id;
                  const isHovered = hoveredVideo?.id === pCam.id;
                  const hasSegments = pCam.segments && pCam.segments.length > 0;
                  const isMaster = pCam.is_master;

                  return (
                    <div 
                      key={pCam.id}
                      className="relative w-6 sm:w-8 h-full flex flex-col items-center group cursor-pointer"
                      onClick={() => handleSelectVideo(pCam)}
                      onMouseEnter={() => setHoveredVideo(pCam)}
                      onMouseLeave={() => setHoveredVideo(null)}
                    >
                      {/* Track Header Label */}
                      <div className="text-[9px] font-mono font-black text-gray-400 truncate w-full text-center mb-1">
                        {isMaster ? '🏆' : `#${pCam.id}`}
                      </div>

                      {/* Thin Bar Body */}
                      <div className="relative w-2.5 sm:w-3.5 h-full bg-slate-950/60 rounded-full overflow-hidden border border-slate-800">
                        {hasSegments ? (
                          // Split Bar: Discontinuous segmented blocks (띄엄띄엄)
                          pCam.segments.map((seg, sIdx) => {
                            const segDur = seg.video_end - seg.video_start;
                            const pos = getPositionStyles(seg.master_start, segDur);
                            return (
                              <div
                                key={sIdx}
                                style={{ top: pos.top, height: pos.height }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectVideo(pCam, seg.master_start);
                                }}
                                className={`absolute inset-x-0 rounded-sm transition-all ${
                                  isSelected || isHovered
                                    ? 'bg-amber-300 ring-2 ring-amber-400 shadow-lg shadow-amber-500/40'
                                    : 'bg-amber-500/80 hover:bg-amber-400'
                                }`}
                                title={`${seg.label || `Part ${sIdx + 1}`}: ${formatTime(seg.master_start)} ~ ${formatTime(seg.master_end)} (+${seg.sync_offset.toFixed(1)}s)`}
                              />
                            );
                          })
                        ) : (
                          // Continuous Single Bar
                          <div
                            style={getPositionStyles(pCam.master_start_time, pCam.duration)}
                            className={`absolute inset-x-0 rounded-sm transition-all ${
                              isMaster
                                ? isSelected || isHovered
                                  ? 'bg-purple-300 ring-2 ring-purple-400 shadow-lg shadow-purple-500/40'
                                  : 'bg-gradient-to-b from-purple-500 to-twice-magenta'
                                : isSelected || isHovered
                                ? 'bg-cyan-300 ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/40'
                                : 'bg-cyan-500/80 hover:bg-cyan-400'
                            }`}
                            title={`#${pCam.id} ${pCam.title} (${formatDuration(pCam.duration)})`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 3. Child Tracks (하위 직캠: Thin Vertical Bars at Specific Time Spans) */}
              <div className="flex-1 relative h-full">
                {/* Visual horizontal guide lines across timeline */}
                {Array.from({ length: Math.ceil(totalDuration / 900) }).map((_, gIdx) => {
                  const sec = gIdx * 900;
                  const topPx = (sec / totalDuration) * canvasHeight;
                  return (
                    <div
                      key={gIdx}
                      style={{ top: `${topPx}px` }}
                      className="absolute left-0 right-0 border-t border-slate-850/40 pointer-events-none"
                    />
                  );
                })}

                {/* Sub-grid of individual fancams */}
                <div className="relative w-full h-full">
                  {childTracks.map((cCam, cIdx) => {
                    const pos = getPositionStyles(cCam.master_start_time, cCam.duration);
                    const isSelected = selectedVideo?.id === cCam.id;
                    const isHovered = hoveredVideo?.id === cCam.id;
                    const isDrift = cCam.status === 'uncalibrated' || cCam.status === 'drift_warning';
                    
                    // Distribute across lanes horizontally based on index mod
                    const laneLeft = (cIdx % 10) * 9.5;

                    return (
                      <div
                        key={cCam.id}
                        style={{ 
                          top: pos.top, 
                          height: pos.height,
                          left: `${laneLeft}%`,
                          width: '8%'
                        }}
                        onClick={() => handleSelectVideo(cCam)}
                        onMouseEnter={() => setHoveredVideo(cCam)}
                        onMouseLeave={() => setHoveredVideo(null)}
                        className={`absolute rounded-full border transition-all cursor-pointer flex items-center justify-center group ${
                          isSelected || isHovered
                            ? 'bg-twice-magenta ring-2 ring-twice-apricot shadow-lg shadow-twice-magenta/50 z-20'
                            : isDrift
                            ? 'bg-rose-500/80 border-rose-400 hover:bg-rose-400'
                            : 'bg-twice-magenta/60 border-twice-magenta/80 hover:bg-twice-magenta'
                        }`}
                        title={`#${cCam.id} ${cCam.title} [${formatTime(cCam.master_start_time)} ~ ${formatTime(cCam.master_end_time)}]`}
                      >
                        {/* Member/Short Tag */}
                        <span className="text-[8px] font-mono font-black text-white px-0.5 truncate pointer-events-none">
                          {cCam.members?.[0]?.slice(0, 2) || `#${cCam.id}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

          {/* ================= RIGHT DEDICATED PLAYER & INSPECTOR (4 COLS) ================= */}
          <div className="lg:col-span-4 lg:sticky lg:top-4 space-y-4">
            {selectedVideo ? (
              <div className="bg-slate-900/95 border-2 border-twice-magenta/40 rounded-3xl p-5 shadow-2xl backdrop-blur-md space-y-4">
                
                {/* Panel Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30">
                      <Volume2 className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-black text-white uppercase tracking-wider">
                        Video Inspector
                      </h3>
                      <span className="text-[10px] font-mono text-twice-apricot">
                        Video #{selectedVideo.id} • Offset: +{selectedVideo.sync_offset.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/video/${selectedVideo.id}?t=${playerSeekTime}`}
                    className="p-1.5 text-xs font-bold text-gray-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1 border border-slate-700"
                    title="360° 대형 플레이어로 열기"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Embedded YouTube Player pinned on the right */}
                <div className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${selectedVideo.youtube_id}?start=${playerSeekTime}&autoplay=1`}
                    title={selectedVideo.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Video Info */}
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                    {selectedVideo.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-gray-400 mt-1">
                    <span>타임라인: {formatTime(selectedVideo.master_start_time)} ~ {formatTime(selectedVideo.master_end_time)}</span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Duration</span>
                    <div className="text-xs font-mono font-black text-white mt-0.5">
                      {formatDuration(selectedVideo.duration)}
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                    <span className="text-[9px] font-bold text-gray-400 uppercase">Sync Offset</span>
                    <div className="text-xs font-mono font-black text-twice-apricot mt-0.5">
                      +{selectedVideo.sync_offset.toFixed(2)}s
                    </div>
                  </div>
                </div>

                {/* Health Diagnostic Badge */}
                <div className={`p-2.5 rounded-xl border text-xs ${
                  selectedVideo.status === 'verified' || selectedVideo.status === 'master'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : selectedVideo.status === 'segmented'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}>
                  <div className="text-[9px] font-bold uppercase tracking-wider">진단 상태</div>
                  <div className="font-bold text-xs mt-0.5">{selectedVideo.status_reason}</div>
                </div>

                {/* If Split Segments exist (e.g. Video 63) */}
                {selectedVideo.segments && selectedVideo.segments.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <Split className="w-3 h-3" /> 분할 구간 Split Bar ({selectedVideo.segments.length}개)
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {selectedVideo.segments.map((seg, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => setPlayerSeekTime(Math.max(0, Math.floor(seg.video_start)))}
                          className="w-full text-left p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-[10px] font-mono flex items-center justify-between transition-all"
                        >
                          <span className="text-white font-bold">{seg.label || `Part ${sIdx + 1}`}</span>
                          <span className="text-twice-apricot">+{seg.sync_offset.toFixed(1)}s</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open in Main Player */}
                <Link
                  to={`/video/${selectedVideo.id}?t=${playerSeekTime}`}
                  className="w-full py-2 bg-twice-magenta hover:bg-twice-magenta/80 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-lg transition-all"
                >
                  <Play className="w-3 h-3 fill-current" /> 360° 대형 플레이어로 보기
                </Link>
              </div>
            ) : (
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center text-gray-500 font-mono text-xs">
                왼쪽 타임라인에서 바를 클릭하면 여기에 실시간 검증 플레이어가 표시됩니다.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
