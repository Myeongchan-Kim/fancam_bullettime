import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { YouTubePlayer } from 'react-youtube';
import { GitBranch } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../constants';
import { Concert, SyncGraphData, SyncGraphVideoNode, Video } from '../types';
import PairwiseTimelineCalibratorModal from '../components/PairwiseTimelineCalibratorModal';
import { SegmentTimelineCalibratorModal } from '../components/SegmentTimelineCalibratorModal';
import { useGlobalAudio } from '../context/AudioContext';

// Modular Subcomponents & Pure Utilities
import { 
  calculateLocalSeekTime, 
  calculateMasterTimeFromLocal, 
  isCursorInsideVideoRange 
} from '../utils/syncGraphCalculations';
import { ActionToolbar, StatusFilterTabs, SearchFilterBar } from '../components/sync-visualizer/SyncVisualizerToolbar';
import { TimelineLanesCanvas } from '../components/sync-visualizer/TimelineLanesCanvas';
import { DeckStudioHeader } from '../components/sync-visualizer/DeckStudioHeader';
import { DeckPlayersView } from '../components/sync-visualizer/DeckPlayersView';
import { DeckBCalibratorPad } from '../components/sync-visualizer/DeckBCalibratorPad';
import { OverlappingVideosList } from '../components/sync-visualizer/OverlappingVideosList';
import { AiSyncModal } from '../components/sync-visualizer/AiSyncModal';
import { DiscrepancyAuditModal } from '../components/sync-visualizer/DiscrepancyAuditModal';

export default function SyncVisualizerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialConcertId = parseInt(searchParams.get('concert_id') || '2', 10);

  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState<number>(initialConcertId);
  const [graphData, setGraphData] = useState<SyncGraphData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'uncalibrated' | 'ai' | 'verified' | 'segmented' | 'solos'>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Horizontal Scrubber Time Cursor (in Master seconds)
  const [selectedTimeCursor, setSelectedTimeCursor] = useState<number>(0);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(!!localStorage.getItem('admin_key'));
  
  // Dual Deck Pairwise System: Deck A (Left) & Deck B (Right)
  const [videoA, setVideoA] = useState<SyncGraphVideoNode | null>(null);
  const [videoB, setVideoB] = useState<SyncGraphVideoNode | null>(null);
  const [activeDeckSlot, setActiveDeckSlot] = useState<'A' | 'B'>('B');
  const [hoveredVideo, setHoveredVideo] = useState<SyncGraphVideoNode | null>(null);

  // YouTube Player instances for bidirectional native seek sync
  const [playerA, setPlayerA] = useState<YouTubePlayer | null>(null);
  const [playerB, setPlayerB] = useState<YouTubePlayer | null>(null);
  const lastTimeRefA = useRef<number>(0);
  const lastTimeRefB = useRef<number>(0);
  const lastSeekTimeARef = useRef<number>(0);
  const lastSeekTimeBRef = useRef<number>(0);
  const isPlaybackTickRef = useRef<boolean>(false);
  const isDraggingTimelineRef = useRef<boolean>(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Global exclusive audio management
  const { isMuted, activeAudioSource, setActiveAudioSource } = useGlobalAudio();

  // Studio Player View Mode: 'DUAL' (2-Cam Deck A vs B), 'QUAD' (4-Cam Multi-Angle Wall), 'SINGLE' (1-Cam Focus)
  const [playerMode, setPlayerMode] = useState<'DUAL' | 'QUAD' | 'SINGLE'>('DUAL');

  // In-Place Offset Fine-Tuning State (applied to Deck B)
  const [fineTuneDelta, setFineTuneDelta] = useState<number>(0);
  const [isSavingOffset, setIsSavingOffset] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // AI 2-Stage Sync Modal State
  const [isAiSyncModalOpen, setIsAiSyncModalOpen] = useState<boolean>(false);
  const [isAiSyncing, setIsAiSyncing] = useState<boolean>(false);
  const [isRoughSyncing, setIsRoughSyncing] = useState<boolean>(false);
  const [aiSyncTargetVideo, setAiSyncTargetVideo] = useState<SyncGraphVideoNode | null>(null);
  const [aiSyncResult, setAiSyncResult] = useState<any>(null);
  const [aiSyncError, setAiSyncError] = useState<string | null>(null);

  // Full Concert Discrepancy Audit State
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditData, setAuditData] = useState<any>(null);
  const [isBatchAligning, setIsBatchAligning] = useState<boolean>(false);
  const [batchAlignResult, setBatchAlignResult] = useState<any>(null);

  // Modals for pairwise and segment calibration
  const [showPairwiseModal, setShowPairwiseModal] = useState<boolean>(false);
  const [showSegmentModal, setShowSegmentModal] = useState<boolean>(false);
  const [calibratorVideo, setCalibratorVideo] = useState<Video | null>(null);
  const [allVideosForModal, setAllVideosForModal] = useState<Video[]>([]);
  const [isLoadingCalibrator, setIsLoadingCalibrator] = useState<boolean>(false);

  // Zoom / Track Configuration
  const [scaleFactor, setScaleFactor] = useState<number>(18);
  const LANE_WIDTH = 13;
  const LANE_GAP = 5;
  const TIME_AXIS_WIDTH = 48;

  const allMembers = ['Nayeon', 'Jeongyeon', 'Momo', 'Sana', 'Jihyo', 'Mina', 'Dahyun', 'Chaeyoung', 'Tzuyu'];

  // Static player options to prevent iframe re-creation/blinking
  const playerOpts = useMemo(() => ({
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
      mute: 1,
      playsinline: 1,
      enablejsapi: 1,
      rel: 0
    }
  }), []);

  // Fetch Concerts
  useEffect(() => {
    const fetchConcerts = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/concerts`);
        setConcerts(res.data);
      } catch (err: any) {
        console.error('Failed to load concerts', err);
      }
    };
    fetchConcerts();
  }, []);

  // Load Graph Data
  const loadSyncGraph = async (concertId: number, preserveVideoAId?: number, preserveVideoBId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/concerts/${concertId}/sync-graph`);
      const data: SyncGraphData = res.data;
      setGraphData(data);

      if (data.videos && data.videos.length > 0) {
        let master = data.videos.find(v => v.is_master);
        if (!master) master = data.videos[0];

        if (preserveVideoAId) {
          const foundA = data.videos.find(v => v.id === preserveVideoAId);
          setVideoA(foundA || master);
        } else if (!videoA) {
          setVideoA(master);
        }

        if (preserveVideoBId) {
          const foundB = data.videos.find(v => v.id === preserveVideoBId);
          setVideoB(foundB || (data.videos.find(v => !v.is_master) || data.videos[0]));
        } else if (!videoB) {
          const firstTarget = data.videos.find(v => !v.is_master) || data.videos[0];
          setVideoB(firstTarget);
        }
      }
    } catch (err: any) {
      console.error('Failed to load sync graph', err);
      setError(err.response?.data?.detail || err.message || '데이터를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSyncGraph(selectedConcertId);
    setSearchParams({ concert_id: selectedConcertId.toString() });
  }, [selectedConcertId]);

  // Total master concert duration
  const totalDuration = useMemo(() => {
    if (!graphData || !graphData.videos || graphData.videos.length === 0) return 10800;
    return Math.max(
      graphData.master_video?.duration || 0,
      ...graphData.videos.map(v => v.master_end_time || 0),
      7200
    );
  }, [graphData]);

  // Overall Timeline Canvas Height in px
  const canvasHeight = useMemo(() => {
    return Math.max(700, Math.round((totalDuration / 60) * scaleFactor));
  }, [totalDuration, scaleFactor]);

  // Statistics
  const stats = useMemo(() => {
    if (!graphData || !graphData.videos) return { total: 0, uncalibrated: 0, ai: 0, verified: 0, segmented: 0, solos: 0 };
    const videos = graphData.videos;
    return {
      total: videos.length,
      uncalibrated: videos.filter(v => !v.is_master && ((v.calibration_count || 0) === 0 || v.status === 'uncalibrated')).length,
      ai: videos.filter(v => v.status === 'ai_calibrated').length,
      verified: videos.filter(v => (v.calibration_count || 0) > 0 && v.status !== 'uncalibrated').length,
      segmented: videos.filter(v => v.segments && v.segments.length > 0).length,
      solos: videos.filter(v => v.songs && v.songs.some((s: any) => s.is_solo)).length
    };
  }, [graphData]);

  // Packing Compaction Algorithm for Timeline Lanes
  const { lanes, allVisibleVideos, videoLaneMap } = useMemo(() => {
    if (!graphData || !graphData.videos) return { lanes: [], allVisibleVideos: [], videoLaneMap: new Map<number, number>() };

    let visible = graphData.videos.filter(v => {
      if (statusFilter === 'uncalibrated') {
        if (v.is_master || ((v.calibration_count || 0) > 0 && v.status !== 'uncalibrated')) return false;
      } else if (statusFilter === 'ai') {
        if (v.status !== 'ai_calibrated') return false;
      } else if (statusFilter === 'verified') {
        if (v.is_master || (v.calibration_count || 0) === 0 || v.status === 'uncalibrated') return false;
      } else if (statusFilter === 'segmented') {
        if (!v.segments || v.segments.length === 0) return false;
      } else if (statusFilter === 'solos') {
        if (!v.songs || !v.songs.some((s: any) => s.is_solo)) return false;
      }

      if (memberFilter !== 'all') {
        if (!v.members || !v.members.includes(memberFilter)) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = v.title.toLowerCase().includes(query);
        const matchId = v.id.toString() === query.replace('#', '');
        const matchSong = v.songs && v.songs.some((s: any) => s.name.toLowerCase().includes(query));
        if (!matchTitle && !matchId && !matchSong) return false;
      }

      return true;
    });

    const masterVideos = visible.filter(v => v.is_master);
    const nonMasterVideos = visible.filter(v => !v.is_master);

    nonMasterVideos.sort((a, b) => {
      const aStart = a.segments && a.segments.length > 0 ? a.segments[0].master_start : a.master_start_time;
      const bStart = b.segments && b.segments.length > 0 ? b.segments[0].master_start : b.master_start_time;
      return aStart - bStart;
    });

    const packedLanes: { items: SyncGraphVideoNode[], lastEndTime: number }[] = [];
    const videoLaneMap = new Map<number, number>();

    if (masterVideos.length > 0) {
      packedLanes.push({
        items: masterVideos,
        lastEndTime: Math.max(...masterVideos.map(m => m.master_end_time))
      });
      masterVideos.forEach(m => videoLaneMap.set(m.id, 0));
    }

    const MIN_INTERVAL_GAP = 5;

    nonMasterVideos.forEach(cam => {
      const camStart = cam.segments && cam.segments.length > 0 ? cam.segments[0].master_start : cam.master_start_time;
      const camEnd = cam.segments && cam.segments.length > 0 
        ? Math.max(...cam.segments.map(s => s.master_end)) 
        : cam.master_end_time;

      const startIndex = masterVideos.length > 0 ? 1 : 0;
      let placed = false;

      for (let i = startIndex; i < packedLanes.length; i++) {
        if (camStart >= packedLanes[i].lastEndTime + MIN_INTERVAL_GAP) {
          packedLanes[i].items.push(cam);
          packedLanes[i].lastEndTime = Math.max(packedLanes[i].lastEndTime, camEnd);
          videoLaneMap.set(cam.id, i);
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newLaneIdx = packedLanes.length;
        packedLanes.push({
          items: [cam],
          lastEndTime: camEnd
        });
        videoLaneMap.set(cam.id, newLaneIdx);
      }
    });

    return { 
      lanes: packedLanes.map(l => l.items),
      allVisibleVideos: visible,
      videoLaneMap
    };
  }, [graphData, statusFilter, memberFilter, searchQuery, totalDuration]);

  // Total width of packed timeline canvas
  const totalCanvasWidth = useMemo(() => {
    return TIME_AXIS_WIDTH + 16 + (lanes.length * (LANE_WIDTH + LANE_GAP));
  }, [lanes.length]);

  // Calculate videos overlapping with selected horizontal time line
  const overlappingVideos = useMemo(() => {
    if (!graphData || !graphData.videos) return [];
    return graphData.videos.filter(v => isCursorInsideVideoRange(v, selectedTimeCursor));
  }, [graphData, selectedTimeCursor]);

  // User Timeline Seeking (Click & Drag)
  const seekToMasterTimeline = (masterSec: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, masterSec));
    isPlaybackTickRef.current = false;
    setSelectedTimeCursor(clamped);

    const targetA = calculateLocalSeekTime(videoA, clamped);
    const targetB = calculateLocalSeekTime(videoB, clamped, fineTuneDelta);
    try {
      playerA?.seekTo?.(targetA, true);
    } catch (e) {}
    try {
      playerB?.seekTo?.(targetB, true);
    } catch (e) {}
  };

  const updateCursorFromMouseEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickedSec = (clickY / canvasHeight) * totalDuration;
    seekToMasterTimeline(clickedSec);
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingTimelineRef.current = true;
    updateCursorFromMouseEvent(e);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDraggingTimelineRef.current) return;
      updateCursorFromMouseEvent(e);
    };
    const handleGlobalMouseUp = () => {
      isDraggingTimelineRef.current = false;
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [totalDuration, canvasHeight, videoA, videoB, fineTuneDelta, playerA, playerB]);

  const handleSelectVideo = (video: SyncGraphVideoNode, preferredSeekTime?: number) => {
    if (activeDeckSlot === 'A') {
      setVideoA(video);
    } else {
      setVideoB(video);
    }

    if (isCursorInsideVideoRange(video, selectedTimeCursor)) {
      seekToMasterTimeline(selectedTimeCursor);
    } else {
      const targetTime = preferredSeekTime !== undefined ? preferredSeekTime : video.master_start_time;
      seekToMasterTimeline(targetTime);
    }
  };

  const handleSwapDecks = () => {
    const temp = videoA;
    setVideoA(videoB);
    setVideoB(temp);
    setActiveDeckSlot(prev => (prev === 'A' ? 'B' : 'A'));
  };

  const nudge = (seconds: number) => {
    setFineTuneDelta(prev => Number((prev + seconds).toFixed(2)));
  };

  // Keyboard Nudge Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (playerMode !== 'DUAL' || !videoB) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudge(e.shiftKey ? -0.1 : -0.5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudge(e.shiftKey ? 0.1 : 0.5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playerMode, videoB]);

  // Current effective offset for Deck B
  const effectiveOffsetB = videoB 
    ? Number((videoB.sync_offset + fineTuneDelta).toFixed(2))
    : 0;

  // Real-time synchronization when fineTuneDelta changes
  useEffect(() => {
    if (!videoB || !playerB) return;
    const targetB = calculateLocalSeekTime(videoB, selectedTimeCursor, fineTuneDelta);
    try {
      playerB.seekTo(targetB, true);
    } catch (e) {}
  }, [fineTuneDelta]);

  // Save Offset Permanently
  const handleSaveFineTuneOffset = async () => {
    if (!videoB || videoB.is_master) return;
    setIsSavingOffset(true);
    setSaveSuccessMsg(null);

    try {
      let adminKey = localStorage.getItem('admin_key') || '';
      if (!adminKey) {
        const inputKey = window.prompt('오프셋을 저장하려면 Admin Key가 필요합니다:');
        if (!inputKey) {
          setIsSavingOffset(false);
          return;
        }
        adminKey = inputKey.trim();
        localStorage.setItem('admin_key', adminKey);
        setIsAdminMode(true);
      }

      const newOffset = Number((videoB.sync_offset + fineTuneDelta).toFixed(2));
      const parentId = videoA && videoA.id !== videoB.id ? videoA.id : null;
      const relOffset = parentId ? Number((newOffset - (videoA?.sync_offset || 0)).toFixed(2)) : null;

      await axios.patch(
        `${API_BASE_URL}/videos/${videoB.id}/offset`,
        {
          sync_offset: newOffset,
          calibration_method: 'manual_studio',
          calibration_status: 'manually_verified',
          parent_video_id: parentId,
          relative_offset: relOffset
        },
        { headers: { 'x-admin-key': adminKey } }
      );

      setSaveSuccessMsg(`성공적으로 저장되었습니다! (오프셋: +${newOffset}s, 기준: ${videoA ? `#${videoA.id}` : '마스터'}, 검증 카운트 증가)`);
      setFineTuneDelta(0);
      loadSyncGraph(selectedConcertId, videoA?.id, videoB?.id);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to save offset', err);
      if (err?.response?.status === 403) {
        localStorage.removeItem('admin_key');
        setIsAdminMode(false);
        const retryKey = window.prompt('Admin Key가 올바르지 않습니다. 다시 입력해주세요:');
        if (retryKey) {
          localStorage.setItem('admin_key', retryKey.trim());
          setIsAdminMode(true);
          handleSaveFineTuneOffset();
          return;
        }
      }
      alert(`저장 실패: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsSavingOffset(false);
    }
  };

  // AI 2-Stage Multi-Modal Precision Sync Trigger Handler
  const handleTriggerAiSync = async (targetVideo: SyncGraphVideoNode | null) => {
    if (!targetVideo || targetVideo.is_master) return;
    setAiSyncTargetVideo(targetVideo);
    setIsAiSyncModalOpen(true);
    setIsAiSyncing(true);
    setAiSyncResult(null);
    setAiSyncError(null);

    try {
      let adminKey = localStorage.getItem('admin_key') || '';
      if (!adminKey) {
        const inputKey = window.prompt('AI 2-Stage 정밀 싱크를 실행하려면 Admin Key가 필요합니다:');
        if (!inputKey) {
          setIsAiSyncModalOpen(false);
          setIsAiSyncing(false);
          return;
        }
        adminKey = inputKey.trim();
        localStorage.setItem('admin_key', adminKey);
        setIsAdminMode(true);
      }

      const res = await axios.post(
        `${API_BASE_URL}/videos/${targetVideo.id}/ai-sync`,
        {},
        { headers: { 'x-admin-key': adminKey } }
      );

      setAiSyncResult(res.data);
      setFineTuneDelta(0);
      await loadSyncGraph(selectedConcertId, videoA?.id, targetVideo.id);
    } catch (err: any) {
      console.error('AI Sync failed', err);
      if (err?.response?.status === 403) {
        localStorage.removeItem('admin_key');
        setIsAdminMode(false);
        setAiSyncError('Admin Key 인증 실패 (403). 올바른 관리자 키를 입력해주세요.');
      } else {
        setAiSyncError(err?.response?.data?.detail || err?.message || 'AI 정밀 싱크 실행 중 오류가 발생했습니다.');
      }
    } finally {
      setIsAiSyncing(false);
    }
  };

  // AI Rough Sync (세트리스트/설명란 기반 대략적 위치 안착)
  const handleTriggerRoughSync = async (targetVideo: SyncGraphVideoNode) => {
    if (!targetVideo || targetVideo.is_master) return;

    setAiSyncTargetVideo(targetVideo);
    setIsAiSyncModalOpen(true);
    setIsRoughSyncing(true);
    setAiSyncResult(null);
    setAiSyncError(null);

    try {
      let adminKey = localStorage.getItem('admin_key') || '';
      if (!adminKey) {
        const inputKey = window.prompt('대략적 싱크 안착을 실행하려면 Admin Key가 필요합니다:');
        if (!inputKey) {
          setIsAiSyncModalOpen(false);
          setIsRoughSyncing(false);
          return;
        }
        adminKey = inputKey.trim();
        localStorage.setItem('admin_key', adminKey);
        setIsAdminMode(true);
      }

      const res = await axios.post(
        `${API_BASE_URL}/videos/${targetVideo.id}/rough-sync`,
        {},
        { headers: { 'x-admin-key': adminKey } }
      );

      setAiSyncResult({
        ...res.data,
        isRough: true
      });
      setFineTuneDelta(0);
      await loadSyncGraph(selectedConcertId, videoA?.id, targetVideo.id);
    } catch (err: any) {
      console.error('Rough sync failed', err);
      if (err?.response?.status === 403) {
        localStorage.removeItem('admin_key');
        setIsAdminMode(false);
        setAiSyncError('Admin Key 인증 실패 (403). 올바른 관리자 키를 입력해주세요.');
      } else {
        setAiSyncError(err?.response?.data?.detail || err?.message || '대략적 싱크 안착 실행 중 오류가 발생했습니다.');
      }
    } finally {
      setIsRoughSyncing(false);
    }
  };

  // Open Discrepancy Audit Modal
  const handleOpenAuditModal = async () => {
    setShowAuditModal(true);
    setIsAuditing(true);
    setAuditData(null);
    setBatchAlignResult(null);

    try {
      const res = await axios.get(`${API_BASE_URL}/concerts/${selectedConcertId}/audit-discrepancies`);
      setAuditData(res.data);
    } catch (err: any) {
      console.error('Failed to run audit', err);
      alert(`진단 오류: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  // Execute Batch Auto-Align for Concert
  const handleBatchAlignConcert = async () => {
    setIsBatchAligning(true);
    setBatchAlignResult(null);

    try {
      let adminKey = localStorage.getItem('admin_key') || '';
      if (!adminKey) {
        const inputKey = window.prompt('일괄 안착을 실행하려면 Admin Key가 필요합니다:');
        if (!inputKey) {
          setIsBatchAligning(false);
          return;
        }
        adminKey = inputKey.trim();
        localStorage.setItem('admin_key', adminKey);
        setIsAdminMode(true);
      }

      const res = await axios.post(
        `${API_BASE_URL}/concerts/${selectedConcertId}/batch-rough-align`,
        {},
        { headers: { 'x-admin-key': adminKey } }
      );

      setBatchAlignResult(res.data);
      await loadSyncGraph(selectedConcertId);
      const auditRes = await axios.get(`${API_BASE_URL}/concerts/${selectedConcertId}/audit-discrepancies`);
      setAuditData(auditRes.data);
    } catch (err: any) {
      console.error('Batch align failed', err);
      alert(`일괄 안착 실패: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setIsBatchAligning(false);
    }
  };

  // Open Full-Featured Pairwise / Segment Calibrator Modal
  const handleOpenCalibrator = async (video: SyncGraphVideoNode, isSegment: boolean = false) => {
    setIsLoadingCalibrator(true);
    try {
      const vRes = await fetch(`${API_BASE_URL}/videos/${video.id}`);
      if (!vRes.ok) throw new Error('영상 정보를 불러오지 못했습니다.');
      const vData = await vRes.json();
      setCalibratorVideo(vData);

      const allRes = await fetch(`${API_BASE_URL}/videos?concert_id=${selectedConcertId}&limit=500`);
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
    } finally {
      setIsLoadingCalibrator(false);
    }
  };

  // 4. Stable Pairwise Sync Loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (!playerA && !playerB) return;
      if (isDraggingTimelineRef.current) return;

      try {
        const stateA = typeof playerA?.getPlayerState === 'function' ? playerA.getPlayerState() : -1;
        const stateB = typeof playerB?.getPlayerState === 'function' ? playerB.getPlayerState() : -1;
        const timeA = typeof playerA?.getCurrentTime === 'function' ? playerA.getCurrentTime() : 0;
        const timeB = typeof playerB?.getCurrentTime === 'function' ? playerB.getCurrentTime() : 0;

        // --- Deck A is actively playing ---
        if (stateA === 1 && videoA) {
          isPlaybackTickRef.current = true;
          const masterTime = calculateMasterTimeFromLocal(videoA, timeA, totalDuration);
          
          if (Math.abs(masterTime - selectedTimeCursor) > 1.0) {
            setSelectedTimeCursor(masterTime);
          }

          if (playerB && videoB) {
            const expB = calculateLocalSeekTime(videoB, masterTime, fineTuneDelta);
            const durB = videoB.duration || 300;
            if (expB >= 0 && expB <= durB) {
              if (stateB !== 1 && stateB !== 3) {
                // Deck B is paused/cued, start playing from target sync position
                playerB.seekTo(expB, true);
                playerB.playVideo();
                lastSeekTimeBRef.current = Date.now();
              } else if (stateB === 1 && Math.abs(timeB - expB) > 0.9 && (Date.now() - lastSeekTimeBRef.current > 2000)) {
                // Correct significant drift only after 2s stabilization grace period
                playerB.seekTo(expB, true);
                lastSeekTimeBRef.current = Date.now();
              }
            } else if (stateB === 1) {
              playerB.pauseVideo();
            }
          }
          setTimeout(() => { isPlaybackTickRef.current = false; }, 80);
          lastTimeRefA.current = timeA;
          lastTimeRefB.current = timeB;
          return;
        }

        // --- Deck B is actively playing ---
        if (stateB === 1 && videoB && stateA !== 1) {
          isPlaybackTickRef.current = true;
          const masterTime = calculateMasterTimeFromLocal(videoB, timeB, totalDuration, fineTuneDelta);
          
          if (Math.abs(masterTime - selectedTimeCursor) > 1.0) {
            setSelectedTimeCursor(masterTime);
          }

          if (playerA && videoA) {
            const expA = calculateLocalSeekTime(videoA, masterTime);
            const durA = videoA.duration || 300;
            if (expA >= 0 && expA <= durA) {
              if (stateA !== 1 && stateA !== 3) {
                playerA.seekTo(expA, true);
                playerA.playVideo();
                lastSeekTimeARef.current = Date.now();
              } else if (stateA === 1 && Math.abs(timeA - expA) > 0.9 && (Date.now() - lastSeekTimeARef.current > 2000)) {
                playerA.seekTo(expA, true);
                lastSeekTimeARef.current = Date.now();
              }
            } else if (stateA === 1) {
              playerA.pauseVideo();
            }
          }
          setTimeout(() => { isPlaybackTickRef.current = false; }, 80);
          lastTimeRefA.current = timeA;
          lastTimeRefB.current = timeB;
          return;
        }

        // --- Both paused: Detect user seeking on native YouTube seekbar ---
        if (stateA !== 1 && stateB !== 1) {
          if (videoA && Math.abs(timeA - lastTimeRefA.current) > 1.5) {
            isPlaybackTickRef.current = true;
            const masterTime = calculateMasterTimeFromLocal(videoA, timeA, totalDuration);
            setSelectedTimeCursor(masterTime);
            if (playerB && videoB) {
              const expB = calculateLocalSeekTime(videoB, masterTime, fineTuneDelta);
              playerB.seekTo(expB, true);
            }
            setTimeout(() => { isPlaybackTickRef.current = false; }, 80);
          } else if (videoB && Math.abs(timeB - lastTimeRefB.current) > 1.5) {
            isPlaybackTickRef.current = true;
            const masterTime = calculateMasterTimeFromLocal(videoB, timeB, totalDuration, fineTuneDelta);
            setSelectedTimeCursor(masterTime);
            if (playerA && videoA) {
              const expA = calculateLocalSeekTime(videoA, masterTime);
              playerA.seekTo(expA, true);
            }
            setTimeout(() => { isPlaybackTickRef.current = false; }, 80);
          }
        }

        lastTimeRefA.current = timeA;
        lastTimeRefB.current = timeB;
      } catch (e) {}
    }, 250);

    return () => clearInterval(interval);
  }, [playerA, playerB, videoA, videoB, fineTuneDelta, totalDuration, selectedTimeCursor]);

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header Card */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl backdrop-blur-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-twice-magenta/20 text-twice-magenta border border-twice-magenta/30 flex items-center gap-1.5 shadow-sm">
                <GitBranch className="w-3.5 h-3.5" /> Unified Multi-Track Sync & Calibration Studio
              </span>
              <span className="text-gray-400 text-xs font-mono hidden sm:inline">1:1 타임라인 동기화 • 실시간 자유 듀얼 캘리브레이션 데크</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              TWICE Concert Multi-Track Timeline & Calibration
            </h1>
          </div>

          <ActionToolbar
            concerts={concerts}
            selectedConcertId={selectedConcertId}
            loading={loading}
            isAdminMode={isAdminMode}
            onConcertChange={setSelectedConcertId}
            onRefresh={() => loadSyncGraph(selectedConcertId)}
            onOpenAuditModal={handleOpenAuditModal}
            onAdminToggle={async () => {
              if (isAdminMode) {
                if (window.confirm('Admin 모드를 로그아웃 하시겠습니까?')) {
                  localStorage.removeItem('admin_key');
                  setIsAdminMode(false);
                }
              } else {
                const key = window.prompt('Admin Key를 입력해주세요:');
                if (key) {
                  const trimmed = key.trim();
                  try {
                    await axios.post(
                      `${API_BASE_URL}/admin/verify`,
                      {},
                      { headers: { 'x-admin-key': trimmed } }
                    );
                    localStorage.setItem('admin_key', trimmed);
                    setIsAdminMode(true);
                    alert('Admin 인증에 성공했습니다!');
                  } catch (err) {
                    alert('Admin Key가 올바르지 않습니다.');
                  }
                }
              }
            }}
          />
        </div>

        {/* Divider & Status Filter Tabs in Header (Second Row) */}
        <StatusFilterTabs
          statusFilter={statusFilter}
          stats={stats}
          onStatusFilterChange={setStatusFilter}
        />
      </div>

      {/* Filter Toolbar & Zoom Scale Slider */}
      <SearchFilterBar
        searchQuery={searchQuery}
        memberFilter={memberFilter}
        allMembers={allMembers}
        scaleFactor={scaleFactor}
        onSearchChange={setSearchQuery}
        onMemberFilterChange={setMemberFilter}
        onScaleChange={setScaleFactor}
      />

      {/* Main Dual-View: Left Timeline (4 cols) + Right Deck Studio (8 cols) */}
      {!loading && !error && graphData && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Packed Timeline Canvas */}
          <TimelineLanesCanvas
            timelineRef={timelineRef}
            canvasHeight={canvasHeight}
            totalCanvasWidth={totalCanvasWidth}
            totalDuration={totalDuration}
            TIME_AXIS_WIDTH={TIME_AXIS_WIDTH}
            LANE_WIDTH={LANE_WIDTH}
            LANE_GAP={LANE_GAP}
            lanes={lanes}
            allVisibleVideos={allVisibleVideos}
            videoLaneMap={videoLaneMap}
            selectedTimeCursor={selectedTimeCursor}
            videoA={videoA}
            videoB={videoB}
            hoveredVideo={hoveredVideo}
            onTimelineMouseDown={handleTimelineMouseDown}
            onSelectVideo={handleSelectVideo}
            onHoverVideo={setHoveredVideo}
            formatTime={formatTime}
          />

          {/* Right Multi-Angle Deck & Calibration Studio */}
          <div className="lg:col-span-8 xl:col-span-9 lg:sticky lg:top-4 space-y-4">
            <DeckStudioHeader
              playerMode={playerMode}
              activeDeckSlot={activeDeckSlot}
              activeAudioSource={activeAudioSource}
              selectedTimeCursor={selectedTimeCursor}
              formatTime={formatTime}
              onSetPlayerMode={setPlayerMode}
              onSetActiveDeckSlot={setActiveDeckSlot}
              onSwapDecks={handleSwapDecks}
              onSetActiveAudioSource={setActiveAudioSource}
            />

            <DeckPlayersView
              playerMode={playerMode}
              videoA={videoA}
              videoB={videoB}
              activeDeckSlot={activeDeckSlot}
              graphData={graphData}
              selectedTimeCursor={selectedTimeCursor}
              fineTuneDelta={fineTuneDelta}
              playerOpts={playerOpts}
              isMuted={isMuted}
              activeAudioSource={activeAudioSource}
              overlappingVideos={overlappingVideos}
              formatTime={formatTime}
              setVideoA={setVideoA}
              setVideoB={setVideoB}
              setActiveDeckSlot={setActiveDeckSlot}
              setPlayerA={setPlayerA}
              setPlayerB={setPlayerB}
            />

            {/* Common Bottom Dock: In-Place Deck B Calibration Pad */}
            {videoB && !videoB.is_master && (
              <DeckBCalibratorPad
                videoA={videoA}
                videoB={videoB}
                fineTuneDelta={fineTuneDelta}
                effectiveOffsetB={effectiveOffsetB}
                isSavingOffset={isSavingOffset}
                saveSuccessMsg={saveSuccessMsg}
                isAiSyncing={isAiSyncing}
                isRoughSyncing={isRoughSyncing}
                isLoadingCalibrator={isLoadingCalibrator}
                formatTime={formatTime}
                onResetFineTune={() => setFineTuneDelta(0)}
                onDeltaChange={setFineTuneDelta}
                onNudge={nudge}
                onSaveOffset={handleSaveFineTuneOffset}
                onOpenCalibrator={handleOpenCalibrator}
                onTriggerRoughSync={handleTriggerRoughSync}
                onTriggerAiSync={handleTriggerAiSync}
              />
            )}

            <OverlappingVideosList
              overlappingVideos={overlappingVideos}
              selectedTimeCursor={selectedTimeCursor}
              videoA={videoA}
              videoB={videoB}
              formatTime={formatTime}
              onSelectVideoA={setVideoA}
              onSelectVideoB={setVideoB}
              onCardClick={(v) => {
                if (activeDeckSlot === 'A') setVideoA(v);
                else setVideoB(v);
              }}
            />
          </div>
        </div>
      )}

      {/* Modals */}
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

      <AiSyncModal
        isOpen={isAiSyncModalOpen}
        isAiSyncing={isAiSyncing}
        isRoughSyncing={isRoughSyncing}
        aiSyncTargetVideo={aiSyncTargetVideo}
        aiSyncResult={aiSyncResult}
        aiSyncError={aiSyncError}
        onClose={() => setIsAiSyncModalOpen(false)}
      />

      <DiscrepancyAuditModal
        isOpen={showAuditModal}
        isAuditing={isAuditing}
        auditData={auditData}
        isBatchAligning={isBatchAligning}
        batchAlignResult={batchAlignResult}
        graphData={graphData}
        onClose={() => setShowAuditModal(false)}
        onBatchAlign={handleBatchAlignConcert}
        onSelectVideoForInspection={(targetVideo, expectedOffset) => {
          setVideoB(targetVideo);
          setActiveDeckSlot('B');
          setShowAuditModal(false);
          seekToMasterTimeline(expectedOffset);
        }}
      />
    </div>
  );
}
