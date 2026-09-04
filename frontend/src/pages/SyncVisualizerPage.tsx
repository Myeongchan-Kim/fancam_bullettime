import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  GitBranch, AlertTriangle, CheckCircle2, Split, 
  Search, RefreshCw, Calendar, Sparkles, AlertCircle,
  X, Volume2, Maximize2, ChevronDown, Layers,
  Sliders, LayoutGrid, Columns, Square, Save, RotateCcw,
  ShieldCheck, MoveHorizontal, ArrowLeftRight
} from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';
import { Concert, SyncGraphData, SyncGraphVideoNode, Video } from '../types';
import PairwiseTimelineCalibratorModal from '../components/PairwiseTimelineCalibratorModal';
import { SegmentTimelineCalibratorModal } from '../components/SegmentTimelineCalibratorModal';

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

  // Horizontal Scrubber Time Cursor (in Master seconds)
  const [selectedTimeCursor, setSelectedTimeCursor] = useState<number>(0);
  
  // Dual Deck Pairwise System: Deck A (Left) & Deck B (Right)
  const [videoA, setVideoA] = useState<SyncGraphVideoNode | null>(null);
  const [videoB, setVideoB] = useState<SyncGraphVideoNode | null>(null);
  const [activeDeckSlot, setActiveDeckSlot] = useState<'A' | 'B'>('B');
  const [hoveredVideo, setHoveredVideo] = useState<SyncGraphVideoNode | null>(null);

  // Studio Player View Mode: 'DUAL' (2-Cam Deck A vs B), 'QUAD' (4-Cam Multi-Angle Wall), 'SINGLE' (1-Cam Focus)
  const [playerMode, setPlayerMode] = useState<'DUAL' | 'QUAD' | 'SINGLE'>('DUAL');

  // Audio source for multi-angle playback ('DECK_A' | 'DECK_B' | 'MUTE')
  const [audioSource, setAudioSource] = useState<'DECK_A' | 'DECK_B' | 'MUTE'>('DECK_B');

  // In-Place Offset Fine-Tuning State (applied to Deck B)
  const [fineTuneDelta, setFineTuneDelta] = useState<number>(0);
  const [isSavingOffset, setIsSavingOffset] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Full Calibrator Modals
  const [showPairwiseModal, setShowPairwiseModal] = useState<boolean>(false);
  const [showSegmentModal, setShowSegmentModal] = useState<boolean>(false);
  const [calibratorVideo, setCalibratorVideo] = useState<Video | null>(null);
  const [allVideosForModal, setAllVideosForModal] = useState<Video[]>([]);

  // Timeline zoom/scale (px per 100 seconds)
  const [scaleFactor, setScaleFactor] = useState<number>(18);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Lane geometry constants (in px) - compact & sleek
  const TIME_AXIS_WIDTH = 48;
  const LANE_WIDTH = 14;
  const LANE_GAP = 6;

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
        if (data.videos && data.videos.length > 0) {
          const master = data.videos.find(v => v.is_master) || data.videos[0];
          const second = data.videos.find(v => !v.is_master) || data.videos[1] || master;
          setVideoA(master);
          setVideoB(second);
          setSelectedTimeCursor(second.master_start_time || master.master_start_time || 0);
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

  // Reset delta when Deck B video changes
  useEffect(() => {
    setFineTuneDelta(0);
    setSaveSuccessMsg(null);
  }, [videoB?.id]);

  // Swap Deck A and Deck B
  const handleSwapDecks = () => {
    const temp = videoA;
    setVideoA(videoB);
    setVideoB(temp);
    setFineTuneDelta(0);
    setSaveSuccessMsg(null);
  };

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

  // Unified Multi-Track Lane Packing:
  // Sort strictly by master_start_time ascending to achieve maximum left-compaction (왼쪽 밀착)
  const { lanes, allVisibleVideos } = useMemo(() => {
    if (!graphData || !graphData.videos) return { lanes: [], allVisibleVideos: [] };

    const visible: SyncGraphVideoNode[] = [];
    let masterNode: SyncGraphVideoNode | null = null;
    const nonMaster: SyncGraphVideoNode[] = [];

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

      visible.push(v);
      if (v.is_master) {
        masterNode = v;
      } else {
        nonMaster.push(v);
      }
    });

    // Sort strictly by master_start_time ascending to achieve maximum left-compaction (왼쪽 밀착)
    nonMaster.sort((a, b) => a.master_start_time - b.master_start_time);

    const packedLanes: { lastEnd: number; items: SyncGraphVideoNode[] }[] = [];

    // Lane 0 is dedicated to Master Video
    if (masterNode) {
      packedLanes.push({ lastEnd: totalDuration, items: [masterNode] });
    }

    // Pack non-master videos into parallel lanes (reusing leftmost available lane)
    for (const v of nonMaster) {
      const vStart = v.master_start_time;
      const vEnd = v.master_end_time;
      let placed = false;

      // Try placing in leftmost existing lane after Lane 0
      const startIdx = masterNode ? 1 : 0;
      for (let i = startIdx; i < packedLanes.length; i++) {
        const lane = packedLanes[i];
        if (lane.lastEnd <= vStart + 1) {
          lane.items.push(v);
          lane.lastEnd = vEnd;
          placed = true;
          break;
        }
      }

      if (!placed) {
        packedLanes.push({ lastEnd: vEnd, items: [v] });
      }
    }

    return { 
      lanes: packedLanes.map(l => l.items),
      allVisibleVideos: visible
    };
  }, [graphData, statusFilter, memberFilter, searchQuery, totalDuration]);

  // Total width of packed timeline canvas
  const totalCanvasWidth = useMemo(() => {
    return TIME_AXIS_WIDTH + 16 + (lanes.length * (LANE_WIDTH + LANE_GAP));
  }, [lanes.length]);

  // Calculate videos overlapping with selected horizontal time line
  const overlappingVideos = useMemo(() => {
    if (!graphData || !graphData.videos) return [];
    
    return graphData.videos.filter(v => {
      if (v.segments && v.segments.length > 0) {
        return v.segments.some(seg => selectedTimeCursor >= seg.master_start && selectedTimeCursor <= seg.master_end);
      }
      return selectedTimeCursor >= v.master_start_time && selectedTimeCursor <= v.master_end_time;
    });
  }, [graphData, selectedTimeCursor]);

  // Helper to calculate top & height in px
  const getPositionStyles = (startTime: number, duration: number) => {
    const top = (startTime / totalDuration) * canvasHeight;
    const height = Math.max(14, (duration / totalDuration) * canvasHeight);
    return { top: `${top}px`, height: `${height}px` };
  };

  // Helper to calculate exact X pixel position for a lane
  const getLaneX = (laneIdx: number) => {
    return TIME_AXIS_WIDTH + 8 + laneIdx * (LANE_WIDTH + LANE_GAP);
  };

  // Handle timeline click to select horizontal time line
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickedSec = Math.max(0, Math.min(totalDuration, (clickY / canvasHeight) * totalDuration));
    setSelectedTimeCursor(clickedSec);
  };

  const handleSelectVideo = (video: SyncGraphVideoNode, seekToMasterTime?: number) => {
    if (activeDeckSlot === 'A') {
      setVideoA(video);
    } else {
      setVideoB(video);
    }

    if (seekToMasterTime !== undefined) {
      setSelectedTimeCursor(seekToMasterTime);
    } else {
      setSelectedTimeCursor(video.master_start_time);
    }
  };

  // Calculate local player seek time for any video
  const calculateLocalSeekTime = (video: SyncGraphVideoNode | null, currentCursor: number, delta: number = 0) => {
    if (!video) return 0;
    
    if (video.segments && video.segments.length > 0) {
      const activeSeg = video.segments.find(
        seg => currentCursor >= seg.master_start && currentCursor <= seg.master_end
      );
      if (activeSeg) {
        return Math.max(0, Math.floor(currentCursor - (activeSeg.sync_offset + delta)));
      }
    }
    
    return Math.max(0, Math.floor(currentCursor - (video.sync_offset + delta)));
  };

  // Nudge delta helper
  const nudge = (amount: number) => {
    setFineTuneDelta(d => Number((d + amount).toFixed(2)));
  };

  // Keyboard Shortcuts for Nudge (ArrowLeft / ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (!videoB || videoB.is_master) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        let step = 0.5;
        if (e.ctrlKey && e.shiftKey) {
          step = 0.05;
        } else if (e.shiftKey) {
          step = 0.1;
        }
        nudge(dir * step);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoB]);

  // In-Place Offset Save Handler for Deck B
  const handleSaveFineTuneOffset = async () => {
    if (!videoB || videoB.is_master) return;
    setIsSavingOffset(true);
    setSaveSuccessMsg(null);
    try {
      const newOffset = Number((videoB.sync_offset + fineTuneDelta).toFixed(3));
      const adminKey = localStorage.getItem('admin_key') || '';
      
      await axios.patch(
        `${API_BASE_URL}/videos/${videoB.id}`,
        { sync_offset: newOffset },
        { headers: adminKey ? { 'x-admin-key': adminKey } : {} }
      );

      setSaveSuccessMsg(`성공적으로 저장되었습니다! (오프셋: +${newOffset}s)`);
      setFineTuneDelta(0);
      loadSyncGraph(selectedConcertId);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to save offset', err);
      alert(`저장 실패: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsSavingOffset(false);
    }
  };

  // Open Full Calibrator Modal
  const handleOpenCalibrator = async (video: SyncGraphVideoNode, isSegment: boolean = false) => {
    try {
      const res = await fetch(`${API_BASE_URL}/videos/${video.id}/full`);
      if (!res.ok) throw new Error('Failed to fetch full video details');
      const data = await res.json();
      setCalibratorVideo(data);

      const allRes = await fetch(`${API_BASE_URL}/videos?concert_id=${selectedConcertId}&limit=100`);
      if (allRes.ok) {
        const allData = await allRes.json();
        setAllVideosForModal(allData.videos || []);
      }

      if (isSegment) {
        setShowSegmentModal(true);
      } else {
        setShowPairwiseModal(true);
      }
    } catch (err: any) {
      console.error('Failed to open calibrator', err);
      alert(`캘리브레이터 로드 실패: ${err.message}`);
    }
  };

  const allMembers = ['Nayeon', 'Jeongyeon', 'Momo', 'Sana', 'Jihyo', 'Mina', 'Dahyun', 'Chaeyoung', 'Tzuyu'];

  // Current effective offset for Deck B
  const effectiveOffsetB = videoB 
    ? Number((videoB.sync_offset + fineTuneDelta).toFixed(2))
    : 0;

  const seekTimeA = calculateLocalSeekTime(videoA, selectedTimeCursor);
  const seekTimeB = calculateLocalSeekTime(videoB, selectedTimeCursor, fineTuneDelta);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Unified Multi-Track Sync & Calibration Studio
            </span>
            <span className="text-gray-400 text-xs font-mono">1:1 타임라인 동기화 • 실시간 자유 듀얼 캘리브레이션 데크</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            TWICE Concert Multi-Track Timeline & Calibration
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

      {/* ================= DUAL-VIEW: Left Compact Timeline (4 Cols) + Right Multi-Angle Calibration Studio (8 Cols) ================= */}
      {!loading && !error && graphData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* ================= LEFT COMPACT MULTI-TRACK CANVAS (4 COLS) ================= */}
          <div className="lg:col-span-4 xl:col-span-3 bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-md overflow-x-auto">
            
            {/* Unified Track Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 text-xs font-mono sticky top-0 bg-slate-900/95 z-20 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="w-12 text-gray-500 font-bold text-[10px]">시간</span>
                <span className="text-purple-400 font-bold flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3 h-3" /> 타임라인 ({lanes.length}T)
                </span>
              </div>
              <span className="text-gray-500 text-[9px] font-mono">{allVisibleVideos.length}개</span>
            </div>

            {/* Continuous Vertical Canvas Container with SVG Background Sync Connection Lines */}
            <div 
              ref={timelineRef}
              onClick={handleTimelineClick}
              style={{ height: `${canvasHeight}px`, width: `${totalCanvasWidth}px` }} 
              className="relative mt-3 flex cursor-crosshair select-none"
            >
              {/* 1. Left Time Scale Axis (Every 15 minutes) */}
              <div 
                style={{ width: `${TIME_AXIS_WIDTH}px` }}
                className="relative h-full flex-shrink-0 border-r border-slate-800/80"
              >
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

              {/* 2. Background SVG for 1:1 Timeline Sync Connection Lines (회색 연결선) */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
                style={{ height: `${canvasHeight}px` }}
              >
                {lanes.slice(1).flatMap((laneVideos, lIdx) => {
                  const targetLaneIdx = lIdx + 1;
                  const targetX = getLaneX(targetLaneIdx) + LANE_WIDTH / 2;
                  const masterX = getLaneX(0) + LANE_WIDTH / 2;

                  return laneVideos.flatMap((v) => {
                    const isHovered = hoveredVideo?.id === v.id;
                    const isSelectedA = videoA?.id === v.id;
                    const isSelectedB = videoB?.id === v.id;
                    const isHighlighted = isHovered || isSelectedA || isSelectedB;

                    // If video has split segments, draw connection for each segment
                    if (v.segments && v.segments.length > 0) {
                      return v.segments.map((seg, sIdx) => {
                        const y = (seg.master_start / totalDuration) * canvasHeight;
                        return (
                          <line
                            key={`sync-seg-${v.id}-${sIdx}`}
                            x1={masterX}
                            y1={y}
                            x2={targetX}
                            y2={y}
                            stroke={isHighlighted ? '#ff5e99' : 'rgba(148, 163, 184, 0.22)'}
                            strokeWidth={isHighlighted ? 2 : 1}
                            strokeDasharray={isHighlighted ? 'none' : '3 3'}
                            className="transition-all duration-150"
                          />
                        );
                      });
                    }

                    // Continuous video sync connection line from Master Spine (Lane 0) to this video's lane
                    const y = (v.master_start_time / totalDuration) * canvasHeight;
                    return (
                      <line
                        key={`sync-${v.id}`}
                        x1={masterX}
                        y1={y}
                        x2={targetX}
                        y2={y}
                        stroke={isHighlighted ? '#ff5e99' : 'rgba(148, 163, 184, 0.22)'}
                        strokeWidth={isHighlighted ? 2 : 1}
                        strokeDasharray={isHighlighted ? 'none' : '3 3'}
                        className="transition-all duration-150"
                      />
                    );
                  });
                })}
              </svg>

              {/* 3. Unified Parallel Lanes System */}
              <div className="relative h-full flex items-start pl-2 gap-[6px] z-10">
                {lanes.map((laneVideos, lIdx) => {
                  const isMasterLane = lIdx === 0 && laneVideos.some(v => v.is_master);

                  return (
                    <div
                      key={lIdx}
                      style={{ width: `${LANE_WIDTH}px` }}
                      className="relative h-full flex flex-col items-center flex-shrink-0 group"
                    >
                      {/* Lane Header Label */}
                      <div className="text-[8px] font-mono font-bold text-gray-500 truncate w-full text-center mb-1 pointer-events-none">
                        {isMasterLane ? '🏆' : `T${lIdx}`}
                      </div>

                      {/* Lane Background Vertical Rail Guide */}
                      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-slate-800/40 pointer-events-none" />

                      {/* Stacked Thin Bars in this Lane */}
                      {laneVideos.map((cam) => {
                        const isDeckA = videoA?.id === cam.id;
                        const isDeckB = videoB?.id === cam.id;
                        const isHovered = hoveredVideo?.id === cam.id;
                        const isDrift = cam.status === 'uncalibrated' || cam.status === 'drift_warning';
                        const isMaster = cam.is_master;
                        const hasSegments = cam.segments && cam.segments.length > 0;

                        if (hasSegments) {
                          // Split Video Bar (Discontinuous Segments with cut gaps)
                          return cam.segments.map((seg, sIdx) => {
                            const segDur = seg.video_end - seg.video_start;
                            const pos = getPositionStyles(seg.master_start, segDur);
                            return (
                              <div
                                key={`${cam.id}-seg-${sIdx}`}
                                style={{ top: pos.top, height: pos.height }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectVideo(cam, seg.master_start);
                                }}
                                onMouseEnter={() => setHoveredVideo(cam)}
                                onMouseLeave={() => setHoveredVideo(null)}
                                className={`absolute inset-x-0 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                                  isDeckB
                                    ? 'bg-amber-400 border-amber-300 ring-2 ring-twice-magenta shadow-lg shadow-amber-500/50 z-20'
                                    : isDeckA
                                    ? 'bg-sky-400 border-sky-300 ring-2 ring-sky-400 shadow-lg shadow-sky-500/50 z-20'
                                    : isHovered
                                    ? 'bg-amber-400 border-amber-300 ring-1 ring-twice-apricot z-15'
                                    : 'bg-amber-600/80 border-amber-500/80 hover:bg-amber-500'
                                }`}
                                title={`#${cam.id} (${seg.label || `Part ${sIdx+1}`}) ${cam.title} [${formatTime(seg.master_start)} ~ ${formatTime(seg.master_end)}]`}
                              >
                                <span className="text-[6px] font-mono font-black text-slate-950 px-0.5 truncate pointer-events-none">
                                  {isDeckA ? 'A' : isDeckB ? 'B' : cam.members?.[0]?.slice(0, 2) || `#${cam.id}`}
                                </span>
                              </div>
                            );
                          });
                        }

                        // Continuous Single Bar
                        const pos = getPositionStyles(cam.master_start_time, cam.duration);
                        return (
                          <div
                            key={cam.id}
                            style={{ top: pos.top, height: pos.height }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectVideo(cam);
                            }}
                            onMouseEnter={() => setHoveredVideo(cam)}
                            onMouseLeave={() => setHoveredVideo(null)}
                            className={`absolute inset-x-0 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                              isDeckB
                                ? 'bg-twice-magenta border-pink-300 ring-2 ring-twice-magenta shadow-lg shadow-twice-magenta/50 z-20'
                                : isDeckA
                                ? 'bg-sky-400 border-sky-200 ring-2 ring-sky-400 shadow-lg shadow-sky-500/50 z-20'
                                : isMaster
                                ? 'bg-gradient-to-b from-purple-500 to-twice-magenta border-purple-400'
                                : isHovered
                                ? 'bg-twice-magenta/80 border-pink-300 ring-1 ring-twice-apricot z-15'
                                : isDrift
                                ? 'bg-rose-500/80 border-rose-400 hover:bg-rose-400'
                                : cam.duration >= 3600
                                ? 'bg-cyan-500/80 border-cyan-400 hover:bg-cyan-400'
                                : 'bg-pink-600/70 border-pink-500/80 hover:bg-twice-magenta'
                            }`}
                            title={`#${cam.id} ${cam.title} [${formatTime(cam.master_start_time)} ~ ${formatTime(cam.master_end_time)}]`}
                          >
                            <span className="text-[7px] font-mono font-black text-white px-0.5 truncate pointer-events-none">
                              {isDeckA ? 'A' : isDeckB ? 'B' : isMaster ? 'M' : cam.members?.[0]?.slice(0, 2) || `#${cam.id}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* 4. Interactive Horizontal Time Scrubber Line (선택된 타임라인 가로선) */}
              <div
                style={{ top: `${(selectedTimeCursor / totalDuration) * canvasHeight}px` }}
                className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
              >
                <div className="w-full border-t-2 border-twice-magenta shadow-[0_0_12px_rgba(255,94,153,0.8)]" />
                <span className="absolute left-2 -top-3 bg-twice-magenta text-white px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black shadow-lg">
                  ⏱️ {formatTime(selectedTimeCursor)}
                </span>
              </div>

            </div>
          </div>

          {/* ================= RIGHT MULTI-ANGLE DECK & CALIBRATION STUDIO (8 COLS) ================= */}
          <div className="lg:col-span-8 xl:col-span-9 lg:sticky lg:top-4 space-y-4">
            
            {/* Top Studio Control Bar */}
            <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
              
              {/* Left Group: Mode Switcher & Deck Slot Target Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    onClick={() => setPlayerMode('DUAL')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      playerMode === 'DUAL'
                        ? 'bg-twice-magenta text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="자유 2개 영상 1:1 비교 & 캘리브레이션"
                  >
                    <Columns className="w-3.5 h-3.5" /> 2-Cam 듀얼 싱크
                  </button>
                  <button
                    onClick={() => setPlayerMode('QUAD')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      playerMode === 'QUAD'
                        ? 'bg-twice-magenta text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="동시 촬영된 최대 4개 앵글 동시 재생 벽"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> 4-Cam 멀티뷰 벽
                  </button>
                  <button
                    onClick={() => setPlayerMode('SINGLE')}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                      playerMode === 'SINGLE'
                        ? 'bg-twice-magenta text-white shadow-md'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="선택된 영상 단독 풀스크린 뷰"
                  >
                    <Square className="w-3.5 h-3.5" /> 단독 포커스
                  </button>
                </div>

                {/* Deck Target Selector (클릭 시 어느 데크에 넣을지) */}
                {playerMode === 'DUAL' && (
                  <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                    <span className="text-gray-500 text-[10px] px-1.5 font-mono">클릭 대상:</span>
                    <button
                      onClick={() => setActiveDeckSlot('A')}
                      className={`px-2 py-1 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                        activeDeckSlot === 'A'
                          ? 'bg-sky-500 text-white shadow'
                          : 'text-gray-400 hover:text-sky-300'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-sky-300" /> Deck A (좌측)
                    </button>
                    <button
                      onClick={() => setActiveDeckSlot('B')}
                      className={`px-2 py-1 rounded-lg text-[11px] transition-all flex items-center gap-1 ${
                        activeDeckSlot === 'B'
                          ? 'bg-twice-magenta text-white shadow'
                          : 'text-gray-400 hover:text-pink-300'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-twice-apricot" /> Deck B (우측)
                    </button>
                    <button
                      onClick={handleSwapDecks}
                      className="p-1 hover:bg-slate-800 text-gray-300 hover:text-white rounded transition-all ml-0.5"
                      title="Deck A ↔ B 좌우 영상 맞바꾸기"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Right Group: Audio & Time Indicator */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700">
                  <Volume2 className="w-3.5 h-3.5 text-twice-apricot" />
                  <span className="text-gray-400 text-[11px]">오디오:</span>
                  <select
                    value={audioSource}
                    onChange={(e) => setAudioSource(e.target.value as any)}
                    className="bg-transparent text-white text-[11px] font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="DECK_B" className="bg-slate-900">Deck B (우측) 소리</option>
                    <option value="DECK_A" className="bg-slate-900">Deck A (좌측) 소리</option>
                    <option value="MUTE" className="bg-slate-900">음소거</option>
                  </select>
                </div>

                <div className="bg-twice-magenta/10 border border-twice-magenta/30 px-3 py-1.5 rounded-xl text-twice-magenta font-black">
                  ⏱️ {formatTime(selectedTimeCursor)}
                </div>
              </div>

            </div>

            {/* Main Multi-Video Player Grid */}
            {playerMode === 'DUAL' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left Deck: Video A (기준 캠 / 비교 대상 1) */}
                <div className={`bg-slate-900/95 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2 transition-all border-2 ${
                  activeDeckSlot === 'A' ? 'border-sky-500/70 ring-2 ring-sky-500/30' : 'border-sky-500/30'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-[11px] font-mono font-black border border-sky-400/30 flex-shrink-0">
                        A
                      </span>
                      {/* Direct Dropdown Video Selector for Deck A */}
                      <select
                        value={videoA?.id || ''}
                        onChange={(e) => {
                          const targetId = parseInt(e.target.value, 10);
                          const found = graphData?.videos?.find(v => v.id === targetId);
                          if (found) setVideoA(found);
                        }}
                        className="bg-slate-800 text-sky-300 px-2 py-1 rounded-lg border border-sky-500/30 text-xs font-bold focus:outline-none focus:border-sky-400 w-full max-w-[260px] truncate cursor-pointer hover:bg-slate-750"
                      >
                        {graphData?.videos?.map(v => (
                          <option key={`opt-a-${v.id}`} value={v.id} className="bg-slate-900 text-white">
                            {v.is_master ? '🏆 [마스터] ' : ''}#{v.id} {v.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-[10px]">
                        재생: {formatTime(seekTimeA)}
                      </span>
                      <button
                        onClick={() => setActiveDeckSlot('A')}
                        className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold transition-all ${
                          activeDeckSlot === 'A' ? 'bg-sky-500 text-white shadow' : 'bg-slate-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {activeDeckSlot === 'A' ? '● 좌측(A) 활성' : 'A 선택'}
                      </button>
                    </div>
                  </div>

                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-lg">
                    {videoA && (
                      <iframe
                        key={`deckA-${videoA.id}-${seekTimeA}`}
                        src={`https://www.youtube.com/embed/${videoA.youtube_id}?start=${seekTimeA}&autoplay=1&mute=${audioSource === 'DECK_A' ? '0' : '1'}`}
                        title={videoA.title}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    )}
                  </div>

                  <p className="text-[11px] text-gray-300 truncate font-semibold">
                    <span className="text-sky-400 font-mono font-bold mr-1">#{videoA?.id}</span> {videoA?.title}
                  </p>
                </div>

                {/* Right Deck: Video B (타겟 캠 / 비교 대상 2 with In-Place Calibrator) */}
                <div className={`bg-slate-900/95 rounded-2xl p-3 sm:p-4 shadow-xl space-y-2 transition-all border-2 ${
                  activeDeckSlot === 'B' ? 'border-twice-magenta ring-2 ring-twice-magenta/40' : 'border-twice-magenta/40'
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
                    <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                      <span className="w-5 h-5 rounded-full bg-twice-magenta/20 text-twice-magenta flex items-center justify-center text-[11px] font-mono font-black border border-twice-magenta/30 flex-shrink-0">
                        B
                      </span>
                      {/* Direct Dropdown Video Selector for Deck B */}
                      <select
                        value={videoB?.id || ''}
                        onChange={(e) => {
                          const targetId = parseInt(e.target.value, 10);
                          const found = graphData?.videos?.find(v => v.id === targetId);
                          if (found) setVideoB(found);
                        }}
                        className="bg-slate-800 text-twice-magenta px-2 py-1 rounded-lg border border-twice-magenta/30 text-xs font-bold focus:outline-none focus:border-twice-magenta w-full max-w-[260px] truncate cursor-pointer hover:bg-slate-750"
                      >
                        {graphData?.videos?.map(v => (
                          <option key={`opt-b-${v.id}`} value={v.id} className="bg-slate-900 text-white">
                            {v.is_master ? '🏆 [마스터] ' : ''}#{v.id} {v.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-twice-apricot font-mono text-[10px]">
                        재생: {formatTime(seekTimeB)}
                      </span>
                      <button
                        onClick={() => setActiveDeckSlot('B')}
                        className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold transition-all ${
                          activeDeckSlot === 'B' ? 'bg-twice-magenta text-white shadow' : 'bg-slate-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {activeDeckSlot === 'B' ? '● 우측(B) 활성' : 'B 선택'}
                      </button>
                    </div>
                  </div>

                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800 shadow-lg">
                    {videoB && (
                      <iframe
                        key={`deckB-${videoB.id}-${seekTimeB}`}
                        src={`https://www.youtube.com/embed/${videoB.youtube_id}?start=${seekTimeB}&autoplay=1&mute=${audioSource === 'DECK_B' ? '0' : '1'}`}
                        title={videoB.title}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    )}
                  </div>

                  <p className="text-[11px] text-gray-300 truncate font-semibold">
                    {videoB?.title}
                  </p>

                  {/* In-Place Target Offset Calibrator Pad for Deck B */}
                  {videoB && !videoB.is_master && (
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-3">
                      
                      {/* Calibrator Header & Offset / Delta Badge */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-twice-magenta" />
                          <span className="text-xs font-black text-gray-200 uppercase tracking-wide">
                            Deck B 싱크 캘리브레이터
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono">
                          {fineTuneDelta !== 0 && (
                            <button
                              onClick={() => setFineTuneDelta(0)}
                              className="text-[10px] font-bold text-gray-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-all flex items-center gap-1"
                              title="원래 오프셋으로 되돌리기"
                            >
                              <RotateCcw className="w-2.5 h-2.5" /> 초기화
                            </button>
                          )}
                          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 shadow-inner text-[11px]">
                            <span className="text-gray-400">
                              Delta: <strong className={fineTuneDelta > 0 ? 'text-emerald-400' : fineTuneDelta < 0 ? 'text-rose-400' : 'text-gray-400'}>
                                {fineTuneDelta > 0 ? `+${fineTuneDelta.toFixed(2)}` : fineTuneDelta.toFixed(2)}s
                              </strong>
                            </span>
                            <div className="h-3 w-px bg-slate-800" />
                            <span className="font-black text-white">
                              +{effectiveOffsetB.toFixed(2)}s
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Smooth Scrubber Range Slider (빠른 이동) */}
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
                        <div className="flex justify-between items-center text-[9px] text-gray-400 font-mono">
                          <span>-30s</span>
                          <span className="text-twice-magenta font-bold flex items-center gap-1">
                            <MoveHorizontal className="w-2.5 h-2.5 animate-pulse" /> 슬라이더로 빠른 오프셋 이동 (0.05s)
                          </span>
                          <span>+30s</span>
                        </div>
                        <input
                          type="range"
                          min={Math.max(0, (videoB.sync_offset || 0) - 30)}
                          max={(videoB.sync_offset || 0) + 30}
                          step={0.05}
                          value={effectiveOffsetB}
                          onChange={(e) => {
                            const newOff = parseFloat(e.target.value);
                            setFineTuneDelta(Number((newOff - videoB.sync_offset).toFixed(2)));
                          }}
                          className="w-full accent-twice-magenta bg-slate-800 rounded-lg h-1.5 cursor-pointer transition-all hover:bg-slate-700"
                        />
                      </div>

                      {/* Step Nudge Buttons Grid (0.05s, 0.1s, 0.5s, 1.0s) */}
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 font-mono text-[11px]">
                        <button 
                          onClick={() => nudge(-1.0)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          -1.0s
                        </button>
                        <button 
                          onClick={() => nudge(-0.5)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          -0.50s
                        </button>
                        <button 
                          onClick={() => nudge(-0.1)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          -0.10s
                        </button>
                        <button 
                          onClick={() => nudge(-0.05)} 
                          className="py-1.5 bg-slate-800/90 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/40 font-black rounded-lg transition-all active:scale-95 shadow-sm"
                        >
                          -0.05s
                        </button>
                        <button 
                          onClick={() => nudge(+0.05)} 
                          className="py-1.5 bg-slate-800/90 hover:bg-slate-700 text-twice-magenta border border-twice-magenta/40 font-black rounded-lg transition-all active:scale-95 shadow-sm"
                        >
                          +0.05s
                        </button>
                        <button 
                          onClick={() => nudge(+0.1)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          +0.10s
                        </button>
                        <button 
                          onClick={() => nudge(+0.5)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          +0.50s
                        </button>
                        <button 
                          onClick={() => nudge(+1.0)} 
                          className="py-1.5 bg-slate-800 hover:bg-slate-700 text-gray-200 font-black rounded-lg transition-all active:scale-95 shadow-sm border border-slate-700/80"
                        >
                          +1.0s
                        </button>
                      </div>

                      {/* Keyboard shortcuts hints & Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5">
                          <span>💡 단축키:</span>
                          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">←</kbd>
                          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded border border-slate-700 text-[9px]">→</kbd> (0.5s)
                          <span className="text-gray-600">│</span>
                          <kbd className="px-1 py-0.5 bg-slate-800 text-gray-300 rounded text-[9px]">Shift</kbd> + 방향키 (0.1s)
                        </div>

                        <div className="flex items-center gap-2">
                          {fineTuneDelta !== 0 && (
                            <button
                              onClick={handleSaveFineTuneOffset}
                              disabled={isSavingOffset}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950 text-xs transition-all"
                            >
                              <Save className="w-3.5 h-3.5" /> 오프셋 영구 저장
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenCalibrator(videoB, videoB.segments && videoB.segments.length > 0)}
                            className="px-3 py-1.5 bg-twice-magenta/20 hover:bg-twice-magenta/30 text-twice-magenta rounded-xl border border-twice-magenta/40 flex items-center gap-1.5 font-bold text-xs transition-all"
                            title="정밀 오디오 파형 캘리브레이터 열기"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> 정밀 캘리브레이터
                          </button>
                        </div>
                      </div>

                      {saveSuccessMsg && (
                        <div className="p-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] rounded-xl text-center font-bold animate-fade-in">
                          {saveSuccessMsg}
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>
            )}

            {/* 4-Cam Multi-View Wall */}
            {playerMode === 'QUAD' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {overlappingVideos.slice(0, 4).map((v, idx) => {
                  const isSelectedA = videoA?.id === v.id;
                  const isSelectedB = videoB?.id === v.id;
                  const vSeek = calculateLocalSeekTime(v, selectedTimeCursor);

                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        if (activeDeckSlot === 'A') setVideoA(v);
                        else setVideoB(v);
                      }}
                      className={`p-2.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                        isSelectedB
                          ? 'bg-slate-900 border-twice-magenta shadow-xl ring-2 ring-twice-magenta/40'
                          : isSelectedA
                          ? 'bg-slate-900 border-sky-400 shadow-xl ring-2 ring-sky-400/40'
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1.5 truncate max-w-[240px] text-white">
                          <span className="w-4 h-4 rounded-full bg-slate-800 text-twice-apricot flex items-center justify-center text-[9px] font-mono">
                            {idx + 1}
                          </span>
                          <span className="text-purple-400 font-mono font-bold">#{v.id}</span>
                          <span className="truncate">{v.title}</span>
                        </span>
                        <span className="text-gray-400 font-mono text-[9px]">
                          {formatTime(vSeek)}
                        </span>
                      </div>

                      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-800">
                        <iframe
                          key={`quad-${v.id}-${vSeek}`}
                          src={`https://www.youtube.com/embed/${v.youtube_id}?start=${vSeek}&autoplay=1&mute=${(audioSource === 'DECK_B' && isSelectedB) || (audioSource === 'DECK_A' && isSelectedA) ? '0' : '1'}`}
                          title={v.title}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>

                      <p className="text-[10px] text-gray-400 truncate">
                        {v.members && v.members.length > 0 && (
                          <span className="text-twice-apricot mr-1.5 font-semibold">[{v.members.join(', ')}]</span>
                        )}
                        {v.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Single Cinema Player */}
            {playerMode === 'SINGLE' && (videoB || videoA) && (
              <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-3">
                {(() => {
                  const target = videoB || videoA!;
                  const tSeek = calculateLocalSeekTime(target, selectedTimeCursor);
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white line-clamp-1">
                          <span className="text-twice-magenta font-mono font-bold mr-1.5">#{target.id}</span>
                          {target.title}
                        </h3>
                        <Link
                          to={`/video/${target.id}?t=${tSeek}`}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg flex items-center gap-1 text-xs"
                        >
                          <Maximize2 className="w-3.5 h-3.5" /> 360° 멀티뷰
                        </Link>
                      </div>

                      <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
                        <iframe
                          key={`single-${target.id}-${tSeek}`}
                          src={`https://www.youtube.com/embed/${target.youtube_id}?start=${tSeek}&autoplay=1`}
                          title={target.title}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Overlapping Videos Multi-Angle List (동시 촬영된 다각도 영상 목록) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl backdrop-blur-md space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-black text-white">
                  <Layers className="w-4 h-4 text-twice-apricot" />
                  <span>동시 촬영된 다각도 직캠 ({overlappingVideos.length}개)</span>
                </div>
                <span className="text-[10px] font-mono text-gray-400">
                  ⏱️ 타임라인 시점: {formatTime(selectedTimeCursor)}
                </span>
              </div>

              {overlappingVideos.length === 0 ? (
                <div className="py-4 text-center text-gray-500 font-mono text-xs">
                  이 시점에 동시 촬영된 영상이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {overlappingVideos.map((v) => {
                    const isDeckA = videoA?.id === v.id;
                    const isDeckB = videoB?.id === v.id;
                    const isDrift = v.status === 'uncalibrated' || v.status === 'drift_warning';
                    const vSeek = calculateLocalSeekTime(v, selectedTimeCursor);

                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          if (activeDeckSlot === 'A') setVideoA(v);
                          else setVideoB(v);
                        }}
                        className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                          isDeckB
                            ? 'bg-twice-magenta/20 border-twice-magenta text-white shadow-md ring-1 ring-twice-magenta/40'
                            : isDeckA
                            ? 'bg-sky-500/20 border-sky-400 text-white shadow-md ring-1 ring-sky-400/40'
                            : 'bg-slate-800/70 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600 text-gray-300'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-black flex-shrink-0 relative">
                          <img
                            src={`https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`}
                            alt={v.title}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[7px] font-mono font-bold text-white px-1 rounded">
                            {formatTime(vSeek)}
                          </span>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-black text-white truncate max-w-[120px] flex items-center gap-1">
                              <span className="text-purple-400 font-mono">#{v.id}</span>
                              <span className="truncate">{v.title}</span>
                            </span>
                            
                            {/* Deck Assign Badges */}
                            <div className="flex items-center gap-1 font-mono flex-shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVideoA(v);
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-black transition-all ${
                                  isDeckA 
                                    ? 'bg-sky-500 text-white shadow ring-1 ring-white' 
                                    : 'bg-slate-800 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30'
                                }`}
                                title="Deck A (좌측 레퍼런스)로 지정"
                              >
                                Deck A
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVideoB(v);
                                }}
                                className={`text-[9px] px-1.5 py-0.5 rounded font-black transition-all ${
                                  isDeckB 
                                    ? 'bg-twice-magenta text-white shadow ring-1 ring-white' 
                                    : 'bg-slate-800 hover:bg-twice-magenta/30 text-twice-magenta border border-twice-magenta/30'
                                }`}
                                title="Deck B (우측 타겟 직캠)로 지정"
                              >
                                Deck B
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-1 mt-0.5 text-[9px]">
                            <p className="text-gray-400 truncate flex-1">
                              {v.members && v.members.length > 0 && (
                                <span className="text-twice-apricot mr-1 font-semibold">[{v.members.join(', ')}]</span>
                              )}
                              {v.title}
                            </p>
                            {isDrift ? (
                              <span className="text-[7px] font-bold text-rose-400 bg-rose-950 px-1 rounded border border-rose-500/30 flex-shrink-0">
                                🔴 오차
                              </span>
                            ) : (
                              <span className="text-[7px] font-bold text-emerald-400 bg-emerald-950 px-1 rounded border border-emerald-500/30 flex-shrink-0">
                                🟢 싱크
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ================= FULL MODALS INTEGRATION ================= */}
      {showPairwiseModal && calibratorVideo && (
        <PairwiseTimelineCalibratorModal
          currentVideo={calibratorVideo}
          allConcertVideos={allVideosForModal}
          onClose={() => setShowPairwiseModal(false)}
          onSaved={() => {
            setShowPairwiseModal(false);
            loadSyncGraph(selectedConcertId);
          }}
        />
      )}

      {showSegmentModal && calibratorVideo && (
        <SegmentTimelineCalibratorModal
          video={calibratorVideo}
          allConcertVideos={allVideosForModal}
          onClose={() => setShowSegmentModal(false)}
          onSaveSuccess={() => {
            setShowSegmentModal(false);
            loadSyncGraph(selectedConcertId);
          }}
        />
      )}

    </div>
  );
}
