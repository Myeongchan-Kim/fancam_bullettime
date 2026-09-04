import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  GitBranch, Play, AlertTriangle, CheckCircle2, Split, 
  Search, RefreshCw, Music, 
  Calendar, Layers, Sparkles, AlertCircle,
  X, User, ChevronDown, Volume2, Maximize2
} from 'lucide-react';
import { API_BASE_URL } from '../constants';
import { Concert, SyncGraphData, SyncGraphVideoNode, SyncGraphSetlistItem } from '../types';

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

  // Active / Selected Video & Song for Dedicated Right Player Panel
  const [selectedVideo, setSelectedVideo] = useState<SyncGraphVideoNode | null>(null);
  const [activeSong, setActiveSong] = useState<SyncGraphSetlistItem | null>(null);
  const [playerSeekTime, setPlayerSeekTime] = useState<number>(0);

  // Timeline zoom/scale (px per 100 seconds)
  const [scaleFactor, setScaleFactor] = useState<number>(25);
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
    if (!graphData) return { total: 0, verified: 0, segmented: 0, needsFix: 0 };
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
    return (totalDuration / 100) * scaleFactor;
  }, [totalDuration, scaleFactor]);

  // Group videos into Hierarchy Track Columns:
  // Col 1: Master (Spine)
  // Col 2: Full Cams (duration >= 3600 or segments > 2)
  // Col 3: Act / Medley Cams (600 <= duration < 3600)
  // Col 4: Individual & Solo Fancams (duration < 600)
  const tracks = useMemo(() => {
    const res: {
      master: SyncGraphVideoNode | null;
      fulls: SyncGraphVideoNode[];
      acts: SyncGraphVideoNode[];
      solos: SyncGraphVideoNode[];
    } = { master: null, fulls: [], acts: [], solos: [] };

    if (!graphData) return res;

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

      if (v.is_master || (v.duration >= 7200 && !res.master)) {
        res.master = v;
      } else if (v.duration >= 3600 || (v.segments && v.segments.length > 2)) {
        res.fulls.push(v);
      } else if (v.duration >= 600 || (v.songs && v.songs.length >= 2)) {
        res.acts.push(v);
      } else {
        res.solos.push(v);
      }
    });

    return res;
  }, [graphData, statusFilter, memberFilter, searchQuery]);

  // Helper to calculate top & height in px
  const getPositionStyles = (startTime: number, duration: number) => {
    const top = (startTime / totalDuration) * canvasHeight;
    const height = Math.max(28, (duration / totalDuration) * canvasHeight);
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Vertical Multi-Track DAW
            </span>
            <span className="text-gray-400 text-xs font-mono">Hierarchical Timeline Visualizer & Pinned Player</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            TWICE Concert Multi-Track Sync Canvas
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            상위 계층(마스터 &gt; 풀캠 &gt; 액트)이 왼쪽에 연속 세로 바로 배치되며, 오른쪽으로 갈라져 나오는 개별 직캠을 클릭하면 우측 분리 플레이어에서 즉시 재생/검증합니다.
          </p>
        </div>

        {/* Concert Selector */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedConcertId}
              onChange={(e) => setSelectedConcertId(parseInt(e.target.value, 10))}
              className="bg-slate-800 text-white pl-9 pr-8 py-2.5 rounded-xl border border-slate-700 text-sm font-bold focus:outline-none focus:border-twice-magenta appearance-none cursor-pointer hover:bg-slate-750 transition-all shadow-inner"
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
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white rounded-xl border border-slate-700 transition-all shadow-sm"
            title="Refresh Sync Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-twice-magenta' : ''}`} />
          </button>
        </div>
      </div>

      {/* Health Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
            statusFilter === 'all' 
              ? 'bg-slate-800/90 border-slate-600 shadow-lg ring-1 ring-white/20' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider">
            <span>Total Videos</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white mt-2">{stats.total}</div>
          <div className="text-[11px] text-gray-400 mt-1 font-mono">전체 등록 직캠</div>
        </button>

        <button
          onClick={() => setStatusFilter('verified')}
          className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
            statusFilter === 'verified' 
              ? 'bg-emerald-950/40 border-emerald-500/50 shadow-lg ring-1 ring-emerald-500/30' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <span>Verified Sync</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-2">{stats.verified}</div>
          <div className="text-[11px] text-emerald-500/80 mt-1 font-mono">🟢 정밀 오차 &lt; 0.5s</div>
        </button>

        <button
          onClick={() => setStatusFilter('segmented')}
          className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
            statusFilter === 'segmented' 
              ? 'bg-amber-950/40 border-amber-500/50 shadow-lg ring-1 ring-amber-500/30' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 text-xs font-bold uppercase tracking-wider">
            <span>Split Segments</span>
            <Split className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 mt-2">{stats.segmented}</div>
          <div className="text-[11px] text-amber-500/80 mt-1 font-mono">🟡 편집 컷 분할 관리</div>
        </button>

        <button
          onClick={() => setStatusFilter('needs_fix')}
          className={`p-4 rounded-xl border transition-all text-left flex flex-col justify-between ${
            statusFilter === 'needs_fix' 
              ? 'bg-rose-950/40 border-rose-500/50 shadow-lg ring-1 ring-rose-500/30' 
              : 'bg-slate-900/50 border-slate-800 hover:bg-slate-850'
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 text-xs font-bold uppercase tracking-wider">
            <span>Needs Attention</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-300 mt-2">{stats.needsFix}</div>
          <div className="text-[11px] text-rose-500/80 mt-1 font-mono">🔴 드리프트/미보정 경고</div>
        </button>
      </div>

      {/* Filter Toolbar & Zoom Scale Slider */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="영상 제목, 곡명, 멤버 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 text-white pl-9 pr-4 py-2 rounded-lg text-sm border border-slate-700 focus:outline-none focus:border-twice-magenta placeholder-gray-500"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Member Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setMemberFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              memberFilter === 'all'
                ? 'bg-twice-magenta text-white shadow-md'
                : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-750'
            }`}
          >
            전체 멤버
          </button>
          {allMembers.map(member => (
            <button
              key={member}
              onClick={() => setMemberFilter(member)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                memberFilter === member
                  ? 'bg-twice-apricot text-slate-950 shadow-md font-black'
                  : 'bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-750'
              }`}
            >
              {member}
            </button>
          ))}
        </div>

        {/* Zoom Scale Controller */}
        <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs text-gray-300 font-mono">
          <span>Scale:</span>
          <input 
            type="range" 
            min="15" 
            max="60" 
            value={scaleFactor} 
            onChange={(e) => setScaleFactor(parseInt(e.target.value, 10))}
            className="w-20 accent-twice-magenta cursor-pointer"
          />
          <span className="w-8 text-right text-twice-apricot font-bold">{scaleFactor}px</span>
        </div>
      </div>

      {/* Loading & Error */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <RefreshCw className="w-10 h-10 text-twice-magenta animate-spin mb-4" />
          <h3 className="text-lg font-bold text-white">멀티트랙 캔버스 로딩 중...</h3>
          <p className="text-gray-400 text-xs mt-1">마스터 척추 및 풀캠 트랙 세그먼트를 렌더링하고 있습니다.</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-rose-950/30 border border-rose-500/40 p-6 rounded-2xl text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-rose-200">데이터를 불러오지 못했습니다</h3>
          <p className="text-rose-400 text-xs mt-1">{error}</p>
        </div>
      )}

      {/* ================= MAIN DUAL VIEW: Left Multi-Track Canvas (8 Cols) + Right Sticky Player (4 Cols) ================= */}
      {!loading && !error && graphData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ================= LEFT MULTI-TRACK CANVAS (8 COLS) ================= */}
          <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl backdrop-blur-md overflow-x-auto">
            
            {/* Multi-Track Header Legend */}
            <div className="grid grid-cols-12 gap-2 pb-4 border-b border-slate-850 text-[11px] font-mono text-gray-400 sticky top-0 bg-slate-900/95 z-20 backdrop-blur">
              <div className="col-span-3 font-bold text-white flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-twice-magenta" /> ⏱️ 타임라인 곡
              </div>
              <div className="col-span-2 font-bold text-purple-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> L0: 마스터
              </div>
              <div className="col-span-2 font-bold text-blue-400 flex items-center gap-1">
                <Layers className="w-3 h-3" /> L1: 풀캠
              </div>
              <div className="col-span-2 font-bold text-amber-400 flex items-center gap-1">
                <Split className="w-3 h-3" /> L2: 액트/메들리
              </div>
              <div className="col-span-3 font-bold text-pink-400 flex items-center gap-1">
                <User className="w-3 h-3" /> L3: 개별 직캠
              </div>
            </div>

            {/* Continuous Vertical Canvas Container */}
            <div 
              ref={timelineRef}
              style={{ height: `${canvasHeight}px` }} 
              className="relative w-full mt-4 grid grid-cols-12 gap-2"
            >
              {/* Background Time Grid Lines (Every 10 minutes) */}
              {Array.from({ length: Math.ceil(totalDuration / 600) }).map((_, gIdx) => {
                const sec = gIdx * 600;
                const topPx = (sec / totalDuration) * canvasHeight;
                return (
                  <div
                    key={gIdx}
                    style={{ top: `${topPx}px` }}
                    className="absolute left-0 right-0 border-t border-slate-850/60 pointer-events-none flex items-center"
                  >
                    <span className="text-[9px] font-mono text-slate-600 pl-1 -mt-3.5">
                      {formatTime(sec)}
                    </span>
                  </div>
                );
              })}

              {/* ---------- COL 1 (Col-span 3): Setlist Song Milestone Indicators ---------- */}
              <div className="col-span-3 relative h-full border-r border-slate-800/80 pr-2">
                {graphData.setlist.map((song) => {
                  const pos = getPositionStyles(song.start_time, song.end_time - song.start_time);
                  const isCurActive = activeSong?.id === song.id;

                  return (
                    <div
                      key={song.id}
                      style={{ top: pos.top, height: pos.height }}
                      onClick={() => {
                        setActiveSong(song);
                        if (selectedVideo) {
                          handleSelectVideo(selectedVideo, song.start_time);
                        }
                      }}
                      className={`absolute left-0 right-1 rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                        isCurActive
                          ? 'bg-twice-magenta/20 border-twice-magenta text-white shadow-lg ring-1 ring-twice-magenta/40'
                          : 'bg-slate-850/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-twice-apricot font-mono">
                          {formatTime(song.start_time)}
                        </span>
                        {song.is_solo && (
                          <span className="text-[8px] font-black uppercase px-1 rounded bg-pink-950 text-pink-400 border border-pink-500/30">
                            Solo
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-black truncate leading-tight mt-0.5">
                        {song.name}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ---------- COL 2 (Col-span 2): Master Spine (Video 1094) ---------- */}
              <div className="col-span-2 relative h-full border-r border-slate-800/80 px-1">
                {tracks.master && (
                  <div
                    style={getPositionStyles(0, totalDuration)}
                    onClick={() => handleSelectVideo(tracks.master!)}
                    className={`absolute inset-x-1 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between p-2.5 overflow-hidden shadow-lg ${
                      selectedVideo?.id === tracks.master.id
                        ? 'bg-purple-900/30 border-purple-400 ring-2 ring-purple-500/50 shadow-purple-900/40'
                        : 'bg-purple-950/20 border-purple-500/30 hover:border-purple-500/60'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-[10px] font-black text-purple-300 uppercase tracking-widest">
                      <Sparkles className="w-3 h-3 text-twice-magenta" /> Master
                    </div>
                    <div className="rotate-90 origin-left text-xs font-bold text-purple-200 whitespace-nowrap opacity-70 ml-2">
                      🏆 1094 Master (00:00:00 ~ {formatTime(totalDuration)})
                    </div>
                    <div className="text-[10px] font-mono text-purple-300 font-bold">
                      {formatDuration(totalDuration)}
                    </div>
                  </div>
                )}
              </div>

              {/* ---------- COL 3 (Col-span 2): Full Cam Rails (Discontinuous in Split cuts) ---------- */}
              <div className="col-span-2 relative h-full border-r border-slate-800/80 px-1">
                {tracks.fulls.map((fCam) => {
                  const isSelected = selectedVideo?.id === fCam.id;
                  const hasSegments = fCam.segments && fCam.segments.length > 0;

                  if (hasSegments) {
                    return fCam.segments.map((seg, sIdx) => {
                      const segDur = seg.video_end - seg.video_start;
                      const pos = getPositionStyles(seg.master_start, segDur);
                      return (
                        <div
                          key={`${fCam.id}-seg-${sIdx}`}
                          style={{ top: pos.top, height: pos.height }}
                          onClick={() => handleSelectVideo(fCam, seg.master_start)}
                          className={`absolute inset-x-1 rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-md ${
                            isSelected
                              ? 'bg-amber-900/40 border-amber-400 ring-2 ring-amber-500/50 shadow-amber-900/30'
                              : 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400 hover:bg-amber-950/50'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-bold text-amber-300">
                            <span>#{fCam.id} {seg.label || `Part ${sIdx + 1}`}</span>
                            <span className="font-mono">+{seg.sync_offset.toFixed(1)}s</span>
                          </div>
                          <div className="text-[9px] font-mono text-amber-400 truncate">
                            {formatTime(seg.master_start)} ~ {formatTime(seg.master_end)}
                          </div>
                        </div>
                      );
                    });
                  }

                  const pos = getPositionStyles(fCam.master_start_time, fCam.duration);
                  return (
                    <div
                      key={fCam.id}
                      style={{ top: pos.top, height: pos.height }}
                      onClick={() => handleSelectVideo(fCam)}
                      className={`absolute inset-x-1 rounded-xl p-2.5 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-md ${
                        isSelected
                          ? 'bg-blue-900/40 border-blue-400 ring-2 ring-blue-500/50 shadow-blue-900/30'
                          : 'bg-blue-950/30 border-blue-500/40 hover:border-blue-400 hover:bg-blue-950/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-blue-300">
                        <span>📹 #{fCam.id} Full Cam</span>
                        <span className="font-mono">{formatDuration(fCam.duration)}</span>
                      </div>
                      <div className="text-[10px] font-mono text-blue-400">
                        {formatTime(fCam.master_start_time)} ~ {formatTime(fCam.master_end_time)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ---------- COL 4 (Col-span 2): Act / Medley Cam Tracks ---------- */}
              <div className="col-span-2 relative h-full border-r border-slate-800/80 px-1">
                {tracks.acts.map((aCam) => {
                  const pos = getPositionStyles(aCam.master_start_time, aCam.duration);
                  const isSelected = selectedVideo?.id === aCam.id;
                  return (
                    <div
                      key={aCam.id}
                      style={{ top: pos.top, height: pos.height }}
                      onClick={() => handleSelectVideo(aCam)}
                      className={`absolute inset-x-1 rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                        isSelected
                          ? 'bg-amber-900/40 border-amber-400 ring-2 ring-amber-500/50 shadow-amber-900/30 z-10'
                          : 'bg-amber-950/30 border-amber-500/40 hover:border-amber-400 text-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px] font-bold">
                        <span className="truncate">🎬 #{aCam.id}</span>
                        <span className="font-mono">{formatDuration(aCam.duration)}</span>
                      </div>
                      <div className="text-[9px] font-mono text-amber-300 truncate">
                        {formatTime(aCam.master_start_time)} ~ {formatTime(aCam.master_end_time)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ---------- COL 5 (Col-span 3): Individual & Solo Fancams Track ---------- */}
              <div className="col-span-3 relative h-full pl-1">
                {tracks.solos.map((vCam) => {
                  const pos = getPositionStyles(vCam.master_start_time, vCam.duration);
                  const isSelected = selectedVideo?.id === vCam.id;
                  const isDrift = vCam.status === 'uncalibrated' || vCam.status === 'drift_warning';

                  return (
                    <div
                      key={vCam.id}
                      style={{ top: pos.top, height: pos.height }}
                      onClick={() => handleSelectVideo(vCam)}
                      className={`absolute inset-x-1 rounded-xl p-2 border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                        isSelected
                          ? 'bg-pink-900/40 border-pink-400 ring-2 ring-pink-500/50 shadow-pink-900/30 z-10'
                          : isDrift
                          ? 'bg-rose-950/40 border-rose-500/50 hover:bg-rose-950/60 text-rose-200'
                          : 'bg-slate-800/80 border-slate-700 hover:border-slate-500 hover:bg-slate-750 text-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                        <span className="truncate max-w-[120px]">{vCam.title}</span>
                        {isDrift ? (
                          <span className="text-[8px] font-black uppercase px-1 rounded bg-rose-950 text-rose-400 border border-rose-500/40">
                            🔴 Drift
                          </span>
                        ) : (
                          <span className="text-[8px] font-black uppercase px-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                            🟢 OK
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[9px] font-mono text-twice-apricot mt-0.5">
                        <span>{formatTime(vCam.master_start_time)} ~ {formatTime(vCam.master_end_time)}</span>
                        <span>{formatDuration(vCam.duration)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

          {/* ================= RIGHT DEDICATED PLAYER & INSPECTOR PANEL (4 COLS) ================= */}
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
                        Dedicated Video Inspector
                      </h3>
                      <span className="text-[10px] font-mono text-twice-apricot">
                        Video #{selectedVideo.id} • Offset: +{selectedVideo.sync_offset.toFixed(1)}s
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/video/${selectedVideo.id}?t=${playerSeekTime}`}
                    className="p-1.5 text-xs font-bold text-gray-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1 border border-slate-700"
                    title="360° 멀티앵글 플레이어로 열기"
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
                  <h4 className="text-sm font-bold text-white line-clamp-2">
                    {selectedVideo.title}
                  </h4>
                  <div className="flex items-center gap-2 text-xs font-mono text-gray-400 mt-1">
                    <span>마스터 타임라인: {formatTime(selectedVideo.master_start_time)} ~ {formatTime(selectedVideo.master_end_time)}</span>
                  </div>
                </div>

                {/* Metadata & Diagnostics */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Duration</span>
                    <div className="text-sm font-mono font-black text-white mt-0.5">
                      {formatDuration(selectedVideo.duration)}
                    </div>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Sync Offset</span>
                    <div className="text-sm font-mono font-black text-twice-apricot mt-0.5">
                      +{selectedVideo.sync_offset.toFixed(2)}s
                    </div>
                  </div>
                </div>

                {/* Health Diagnostic Badge */}
                <div className={`p-3 rounded-xl border text-xs ${
                  selectedVideo.status === 'verified' || selectedVideo.status === 'master'
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : selectedVideo.status === 'segmented'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">진단 상태</div>
                  <div className="font-bold mt-0.5">{selectedVideo.status_reason}</div>
                </div>

                {/* If Split Segments exist */}
                {selectedVideo.segments && selectedVideo.segments.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <Split className="w-3 h-3" /> 세그먼트 분할 구간 ({selectedVideo.segments.length}개)
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {selectedVideo.segments.map((seg, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => setPlayerSeekTime(Math.max(0, Math.floor(seg.video_start)))}
                          className="w-full text-left p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-[10px] font-mono flex items-center justify-between transition-all"
                        >
                          <span className="text-white font-bold">{seg.label || `Part ${sIdx + 1}`}</span>
                          <span className="text-twice-apricot">Offset: +{seg.sync_offset.toFixed(1)}s</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open in Main Player */}
                <Link
                  to={`/video/${selectedVideo.id}?t=${playerSeekTime}`}
                  className="w-full py-2.5 bg-twice-magenta hover:bg-twice-magenta/80 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> 360° 대형 플레이어로 보기
                </Link>
              </div>
            ) : (
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 text-center text-gray-500 font-mono text-xs">
                왼쪽 타임라인에서 영상을 클릭하면 여기에 실시간 검증 플레이어가 표시됩니다.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
