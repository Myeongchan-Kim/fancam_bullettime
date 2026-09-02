import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  X, Layers, Plus, Trash2, CheckCircle2, Save, Sparkles, AlertCircle, Zap, Loader2
} from 'lucide-react';
import { Video, VideoSyncSegment } from '../types';

interface SegmentTimelineCalibratorModalProps {
  video: Video;
  allConcertVideos?: Video[];
  onClose: () => void;
  onSaveSuccess?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const SegmentTimelineCalibratorModal: React.FC<SegmentTimelineCalibratorModalProps> = ({
  video,
  onClose,
  onSaveSuccess,
}) => {
  const [segments, setSegments] = useState<VideoSyncSegment[]>(video.sync_segments || []);
  const setlist = video.concert?.setlist || [];
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoAligning, setIsAutoAligning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const adminKey = localStorage.getItem('admin_key') || '';

  // Format seconds to HH:MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fetch freshest segments
  const fetchSegments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/videos/${video.id}/segments`);
      setSegments(res.data);
    } catch (err) {
      console.error('Failed to load segments:', err);
    }
  };

  useEffect(() => {
    fetchSegments();
  }, [video.id]);

  // Handle Add Empty Segment
  const handleAddSegment = () => {
    const lastSeg = segments[segments.length - 1];
    const newStart = lastSeg ? lastSeg.video_end_time : 0;
    const newEnd = Math.min((video.duration || 300), newStart + 180);

    const newSeg: VideoSyncSegment = {
      id: -Date.now(), // temporary negative ID
      video_id: video.id,
      video_start_time: newStart,
      video_end_time: newEnd,
      master_start_time: newStart,
      master_end_time: newEnd,
      sync_offset: 0.0,
      label: `구간 ${segments.length + 1}`,
      is_verified: false
    };

    setSegments([...segments, newSeg]);
  };

  // Handle Update Segment Field
  const handleUpdateField = (index: number, field: keyof VideoSyncSegment, value: any) => {
    const updated = [...segments];
    const target = { ...updated[index], [field]: value };
    
    // Auto-calculate sync_offset if master or video start changes
    if (field === 'master_start_time' || field === 'video_start_time') {
      const vStart = field === 'video_start_time' ? parseFloat(value) || 0 : target.video_start_time;
      const mStart = field === 'master_start_time' ? parseFloat(value) || 0 : target.master_start_time;
      target.sync_offset = mStart - vStart;
    }

    updated[index] = target;
    setSegments(updated);
  };

  // Handle Delete Segment
  const handleDeleteSegment = (index: number) => {
    const updated = segments.filter((_, i) => i !== index);
    setSegments(updated);
  };

  // Handle Save All Segments Bulk
  const handleSaveAll = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const payload = segments.map(s => ({
        setlist_id: s.setlist_id || null,
        video_start_time: Number(s.video_start_time),
        video_end_time: Number(s.video_end_time),
        master_start_time: Number(s.master_start_time),
        master_end_time: Number(s.master_end_time),
        sync_offset: Number(s.sync_offset),
        label: s.label || null,
        is_verified: Boolean(s.is_verified)
      }));

      await axios.post(
        `${API_BASE_URL}/videos/${video.id}/segments/bulk`,
        payload,
        { headers: { 'X-Admin-Key': adminKey } }
      );

      setStatusMessage({ type: 'success', text: `총 ${payload.length}개의 구간 오프셋이 성공적으로 저장되었습니다!` });
      fetchSegments();
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Save failed:', err);
      setStatusMessage({ type: 'error', text: err.response?.data?.detail || '구간 저장에 실패했습니다. 관리자 키를 확인하세요.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-generate from YouTube Description timestamps
  const handleAutoGenerateFromDescription = () => {
    if (!video.description) {
      setStatusMessage({ type: 'error', text: '영상 설명란에 타임스탬프 정보가 없습니다.' });
      return;
    }

    const pattern = /(?:^|\n)\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)(?=\n|$)/g;
    const matches: { timeStr: string; label: string }[] = [];
    let match;
    while ((match = pattern.exec(video.description)) !== null) {
      matches.push({ timeStr: match[1], label: match[2].trim() });
    }

    if (matches.length === 0) {
      setStatusMessage({ type: 'error', text: '설명란에서 타임스탬프 패턴(00:00:00 곡명)을 찾지 못했습니다.' });
      return;
    }

    const parseToSec = (str: string) => {
      const parts = str.split(':').map(Number);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
    };

    const newSegs: VideoSyncSegment[] = [];
    for (let i = 0; i < matches.length; i++) {
      const startSec = parseToSec(matches[i].timeStr);
      const endSec = (i + 1 < matches.length) ? parseToSec(matches[i + 1].timeStr) : (video.duration || startSec + 180);
      const label = matches[i].label;

      // Match with setlist
      const matchedItem = setlist.find(s => {
        const sName = s.song?.name || s.event_name;
        return sName && (sName.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(sName.toLowerCase()));
      });

      const masterStart = matchedItem?.start_time !== null && matchedItem?.start_time !== undefined 
        ? (matchedItem.start_time as number)
        : startSec;
      const masterEnd = masterStart + (endSec - startSec);

      newSegs.push({
        id: -Date.now() - i,
        video_id: video.id,
        setlist_id: matchedItem?.id || null,
        video_start_time: startSec,
        video_end_time: endSec,
        master_start_time: masterStart,
        master_end_time: masterEnd,
        sync_offset: masterStart - startSec,
        label: label,
        is_verified: true
      });
    }

    setSegments(newSegs);
    setStatusMessage({ type: 'info', text: `설명란에서 ${newSegs.length}개 구간을 추출했습니다. [전체 구간 저장]을 눌러 적용하세요.` });
  };

  // Handle AI Boundary Probe Auto Align
  const handleAutoAlign = async () => {
    setIsAutoAligning(true);
    setStatusMessage({ type: 'info', text: '🎧 AI 오디오 핑거프린트 및 양끝 프로브(Boundary Probe)로 콘서트 타임라인 자동 정렬 중...' });
    try {
      const res = await axios.post(`${API_BASE_URL}/videos/${video.id}/auto-align-segments`);
      if (res.data && res.data.success) {
        setStatusMessage({
          type: 'success',
          text: `🎯 [AI 자동 정렬 완료] ${res.data.is_uncut ? '무편집 통짜 영상 (오프셋: ' + res.data.delta_start.toFixed(2) + 's)' : '구간 편집본'} 판정 - ${res.data.segments_count}개 세그먼트 매핑 완료!`
        });
        await fetchSegments();
        if (onSaveSuccess) onSaveSuccess();
      } else {
        setStatusMessage({ type: 'error', text: res.data?.error || 'AI 정렬에 실패했습니다.' });
      }
    } catch (err: any) {
      console.error('Auto-align failed:', err);
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.detail || 'AI 자동 정렬 중 오류가 발생했습니다.'
      });
    } finally {
      setIsAutoAligning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-twice-magenta/20 to-twice-apricot/20 rounded-2xl border border-twice-magenta/30 text-twice-magenta">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2 tracking-tight">
                구간별 마스터 타임라인 동기화 (Piecewise Sync Manager)
              </h2>
              <p className="text-xs text-gray-400 truncate max-w-xl">
                [{video.id}] {video.title} ({formatTime(video.duration)})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoAlign}
              disabled={isAutoAligning}
              className="px-3.5 py-2 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/40 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              title="양끝 프로브(Boundary Probe) 및 오디오 교차 상관으로 1초 만에 전체 콘서트 구간 자동 정렬"
            >
              {isAutoAligning ? <Loader2 className="h-4 w-4 animate-spin text-indigo-400" /> : <Zap className="h-4 w-4 text-indigo-400" />}
              {isAutoAligning ? 'AI 정렬 중...' : 'AI 양끝 프로브 자동 정렬'}
            </button>

            <button
              onClick={handleAutoGenerateFromDescription}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-twice-apricot text-xs font-bold rounded-xl border border-twice-apricot/30 transition-all flex items-center gap-1.5 shadow-sm"
              title="유튜브 설명란의 00:00:00 타임스탬프를 읽어와 자동으로 구간 생성"
            >
              <Sparkles className="h-4 w-4" />
              설명란 파싱
            </button>

            <button
              onClick={handleAddSegment}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-white/10 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4 text-twice-magenta" />
              구간 추가
            </button>

            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-twice-magenta to-twice-apricot hover:opacity-90 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-twice-magenta/20 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? '저장 중...' : '전체 구간 저장'}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-all ml-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 ${
            statusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20' :
            statusMessage.type === 'error' ? 'bg-rose-500/10 text-rose-400 border-b border-rose-500/20' :
            'bg-sky-500/10 text-sky-400 border-b border-sky-500/20'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {statusMessage.text}
          </div>
        )}

        {/* Content Body: Segments Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {segments.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-3xl space-y-4">
              <Layers className="h-12 w-12 text-slate-700 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-gray-300">등록된 타임라인 구간(Segment)이 없습니다.</p>
                <p className="text-xs text-gray-500">
                  풀콘서트나 다중 곡 영상의 경우 상단의 <b>[설명란 자동 파싱]</b> 또는 <b>[구간 추가]</b>를 통해 곡별 오프셋을 등록하세요.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-black uppercase tracking-wider text-gray-400 px-3 pb-1">
                <div className="col-span-1">No</div>
                <div className="col-span-3">구간 라벨 / 곡명</div>
                <div className="col-span-2">영상 시간 (시작 ~ 종료)</div>
                <div className="col-span-2">마스터 콘서트 시간</div>
                <div className="col-span-2">동기화 오프셋 (Offset)</div>
                <div className="col-span-1 text-center">검증</div>
                <div className="col-span-1 text-center">삭제</div>
              </div>

              {segments.map((seg, idx) => (
                <div 
                  key={seg.id || idx}
                  className="grid grid-cols-12 gap-2 items-center bg-slate-900/70 hover:bg-slate-900 border border-slate-800/80 rounded-2xl p-2.5 transition-all text-xs text-white"
                >
                  <div className="col-span-1 font-mono text-gray-500 font-bold px-1">
                    #{idx + 1}
                  </div>

                  <div className="col-span-3">
                    <input 
                      type="text"
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-twice-magenta"
                      value={seg.label || ''}
                      placeholder="곡명 또는 멘트"
                      onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-1 font-mono">
                    <input 
                      type="number"
                      step="0.1"
                      className="w-1/2 bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[11px] text-gray-300 outline-none focus:border-twice-magenta"
                      value={seg.video_start_time}
                      title={`시작: ${formatTime(seg.video_start_time)}`}
                      onChange={(e) => handleUpdateField(idx, 'video_start_time', parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-gray-600">~</span>
                    <input 
                      type="number"
                      step="0.1"
                      className="w-1/2 bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[11px] text-gray-300 outline-none focus:border-twice-magenta"
                      value={seg.video_end_time}
                      title={`종료: ${formatTime(seg.video_end_time)}`}
                      onChange={(e) => handleUpdateField(idx, 'video_end_time', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-1 font-mono">
                    <input 
                      type="number"
                      step="0.1"
                      className="w-1/2 bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[11px] text-twice-apricot outline-none focus:border-twice-apricot"
                      value={seg.master_start_time}
                      title={`마스터 시작: ${formatTime(seg.master_start_time)}`}
                      onChange={(e) => handleUpdateField(idx, 'master_start_time', parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-gray-600">~</span>
                    <input 
                      type="number"
                      step="0.1"
                      className="w-1/2 bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[11px] text-twice-apricot outline-none focus:border-twice-apricot"
                      value={seg.master_end_time}
                      title={`마스터 종료: ${formatTime(seg.master_end_time)}`}
                      onChange={(e) => handleUpdateField(idx, 'master_end_time', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div className="col-span-2">
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="number"
                        step="0.05"
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-2 py-1.5 text-[11px] font-mono font-bold text-twice-magenta outline-none focus:border-twice-magenta"
                        value={seg.sync_offset}
                        onChange={(e) => handleUpdateField(idx, 'sync_offset', parseFloat(e.target.value) || 0)}
                      />
                      <span className="text-[10px] text-gray-500 font-mono">s</span>
                    </div>
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <input 
                      type="checkbox"
                      checked={seg.is_verified || false}
                      onChange={(e) => handleUpdateField(idx, 'is_verified', e.target.checked)}
                      className="rounded accent-twice-magenta cursor-pointer h-4 w-4"
                    />
                  </div>

                  <div className="col-span-1 flex justify-center">
                    <button 
                      onClick={() => handleDeleteSegment(idx)}
                      className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="구간 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span>총 등록 구간: <b className="text-white font-mono">{segments.length}</b>개</span>
            <span>콘서트 셋리스트: <b className="text-twice-apricot font-mono">{setlist.length}</b>곡</span>
          </div>
          <p className="text-[11px] text-gray-500">
            💡 오프셋 공식: <code className="text-gray-300 font-mono">Offset = MasterTime - VideoTime</code>
          </p>
        </div>

      </div>
    </div>
  );
};
