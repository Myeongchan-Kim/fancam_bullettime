"""
Calibration & Metrics Tracking Layer for Videos.
Provides a unified abstraction for recording video calibrations, tracking counts,
managing statuses, and future engagement/view/like metric increments.
"""
from typing import Optional, List, Dict, Any
import datetime
from sqlalchemy.orm import Session
from app.models.models import Video, VideoSyncSegment

def cascade_update_children_offsets(db: Session, parent_id: int, delta: float):
    """Recursively cascade delta offset change to all descendant children in the sync tree."""
    if abs(delta) < 0.0001:
        return
    children = db.query(Video).filter(Video.parent_video_id == parent_id).all()
    for child in children:
        child.sync_offset = round((child.sync_offset or 0.0) + delta, 3)
        # Recurse down descendants
        cascade_update_children_offsets(db, child.id, delta)

def record_video_calibration(
    db: Session,
    video: Video,
    sync_offset: Optional[float] = None,
    method: str = "manual_studio",
    status: str = "manually_verified",
    parent_video_id: Optional[int] = None,
    relative_offset: Optional[float] = None,
    commit: bool = True
) -> Video:
    """
    Unified entry point for calibrating video sync offsets.
    - Updates sync_offset
    - Preserves parent-child sync tree edge (parent_video_id, relative_offset)
    - If video offset moves, cascades delta to all dependent children!
    - Increments calibration_count
    - Updates calibration_status, calibrated_at, and calibration_method
    """
    old_offset = video.sync_offset or 0.0
    if sync_offset is not None:
        video.sync_offset = float(sync_offset)
        delta = float(sync_offset) - old_offset
        # Propagate offset shift to dependent child videos
        cascade_update_children_offsets(db, video.id, delta)
        
    if parent_video_id is not None:
        video.parent_video_id = parent_video_id
    if relative_offset is not None:
        video.relative_offset = float(relative_offset)
    elif video.parent_video_id and sync_offset is not None:
        parent = db.query(Video).filter(Video.id == video.parent_video_id).first()
        if parent and parent.sync_offset is not None:
            video.relative_offset = round(float(sync_offset) - parent.sync_offset, 3)
        
    video.calibration_count = (video.calibration_count or 0) + 1
    video.calibration_status = status
    video.calibrated_at = datetime.datetime.now(datetime.UTC)
    video.calibration_method = method
    
    if commit:
        db.commit()
        db.refresh(video)
        
    return video

def increment_video_metrics(
    db: Session,
    video_id: int,
    view: bool = False,
    like: bool = False,
    commit: bool = True
) -> Optional[Video]:
    """Future metric expansion for views/likes counter."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        return None
    if view:
        video.view_count = (video.view_count or 0) + 1
    if like:
        video.like_count = (video.like_count or 0) + 1
    if commit:
        db.commit()
    return video

def estimate_video_rough_offset(db: Session, video: Video) -> tuple[Optional[float], Optional[str], Optional[int]]:
    """
    곡 제목, 설명란 타임스탬프, 콘서트 세트리스트를 기반으로 영상의 대략적인 오프셋(Macro Offset)을 신속하게 추정합니다.
    Returns: (rough_offset, reason, matched_parent_id)
    """
    import re
    import yt_dlp
    from app.models.models import ConcertSetlist
    from app.crawler.ai_parser import parse_fancam_metadata

    setlists = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == video.concert_id).all()
    setlist_map = {}
    for it in setlists:
        name = (it.song.name if it.song else it.event_name or '').strip()
        if name and it.start_time is not None:
            setlist_map[name.upper()] = it.start_time

    # 1. YouTube 메타데이터 (설명란) 가져오기
    desc = ''
    try:
        ydl_opts = {'quiet': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'https://www.youtube.com/watch?v={video.youtube_id}', download=False)
            desc = info.get('description', '') or ''
            if not video.title and info.get('title'):
                video.title = info.get('title')
    except Exception as e:
        pass

    # 2. DB에 연결된 Video.songs 태그 확인 (가장 정확한 곡 분류)
    if video.songs:
        for s in video.songs:
            s_upper = s.name.upper()
            if s_upper in setlist_map:
                start_t = float(setlist_map[s_upper])
                return start_t, f"등록된 곡 태그 [{s.name}] → 세트리스트 시작 시각 ({start_t}s)", None

    # 3. 설명란 타임스탬프 파싱 (곡명 매칭, 단순 멤버명 오매칭 방지를 위해 4글자 초과 조건)
    pattern = re.compile(r'(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+([^\n\r]+)')
    for line in desc.split('\n'):
        m = pattern.search(line)
        if m:
            h = int(m.group(1)) if m.group(1) else 0
            m_val = int(m.group(2))
            s_val = int(m.group(3))
            local_sec = h * 3600 + m_val * 60 + s_val
            label = m.group(4).strip().upper()
            for s_name, start_t in setlist_map.items():
                if len(label) >= 4 and (s_name in label or (len(label) >= 6 and label in s_name)):
                    approx = max(0.0, float(start_t) - local_sec)
                    return approx, f"유튜브 설명 타임스탬프 [{m.group(4).strip()}] @ {local_sec}s → 세트리스트 {s_name} ({start_t}s)", None

    # 4. 영상 제목 및 설명란 AI 시맨틱 분석
    parsed = parse_fancam_metadata(video.title or '', 'Channel', desc)
    if parsed and parsed.get('songs'):
        for song_title in parsed['songs']:
            st_upper = song_title.upper()
            for s_name, start_t in setlist_map.items():
                if st_upper in s_name or s_name in st_upper:
                    return float(start_t), f"AI 텍스트 분석 [{song_title}] → 세트리스트 {s_name} ({start_t}s)", None

    # 5. 동일 콘서트의 동일 곡을 가진 검증된 피어 직캠 탐색 (Peer Anchor)
    if video.songs:
        for s in video.songs:
            peer = db.query(Video).filter(
                Video.concert_id == video.concert_id,
                Video.id != video.id,
                Video.sync_offset != None,
                Video.calibration_status.in_(["ai_calibrated", "manually_verified"]),
                Video.songs.any(name=s.name)
            ).first()
            if peer and peer.sync_offset:
                return float(peer.sync_offset), f"동일 곡 검증 직캠 #{peer.id} ('{peer.title[:20]}') 기준 안착", peer.id

    return None, None, None

def audit_concert_discrepancies(db: Session, concert_id: int, threshold_seconds: float = 120.0) -> list[dict]:
    """
    특정 콘서트의 모든 직캠 오프셋을 세트리스트 곡 시작 시각과 비교하여
    허용 임계치(기본 120초) 이상 크게 어긋난 의심 영상 목록을 반환합니다.
    """
    from app.models.models import ConcertSetlist

    videos = db.query(Video).filter(Video.concert_id == concert_id, Video.duration < 1800).all()
    setlists = db.query(ConcertSetlist).filter(ConcertSetlist.concert_id == concert_id).all()

    setlist_map = {}
    for item in setlists:
        name = (item.song.name if item.song else item.event_name or '').upper().strip()
        if name and item.start_time is not None:
            setlist_map[name] = item.start_time

    if not setlist_map:
        return []

    discrepancies = []
    for v in videos:
        # Skip if offset is None or if video is master (>1 hour duration)
        if v.sync_offset is None or (v.duration and v.duration > 3600):
            continue

        v_song_names = [s.name.upper().strip() for s in v.songs]
        if not v_song_names:
            for s_name in setlist_map.keys():
                if s_name in (v.title or '').upper():
                    v_song_names.append(s_name)

        if not v_song_names:
            continue

        expected_times = [(s, setlist_map[s]) for s in v_song_names if s in setlist_map]
        if not expected_times:
            continue

        diffs = [(abs(v.sync_offset - exp_t), s, exp_t) for s, exp_t in expected_times]
        diffs.sort(key=lambda x: x[0])
        min_diff, matched_song, exp_t = diffs[0]

        if min_diff > threshold_seconds:
            discrepancies.append({
                "video_id": v.id,
                "title": v.title,
                "duration": v.duration,
                "current_offset": v.sync_offset,
                "expected_offset": exp_t,
                "discrepancy_seconds": round(min_diff, 1),
                "matched_song": matched_song,
                "parent_video_id": v.parent_video_id,
                "calibration_status": v.calibration_status,
                "calibration_method": v.calibration_method
            })

    discrepancies.sort(key=lambda x: -x["discrepancy_seconds"])
    return discrepancies

def auto_macro_align_concert(db: Session, concert_id: int, threshold_seconds: float = 120.0) -> dict:
    """
    특정 콘서트의 어긋난 의심 영상들을 세트리스트 기반으로 일괄 자동 안착(Batch Macro Alignment)합니다.
    """
    candidates = audit_concert_discrepancies(db, concert_id, threshold_seconds)
    results = []
    success_count = 0

    for cand in candidates:
        vid = cand["video_id"]
        video = db.query(Video).filter(Video.id == vid).first()
        if not video:
            continue

        prev_offset = video.sync_offset
        approx_offset, reason, parent_id = estimate_video_rough_offset(db, video)
        if approx_offset is not None:
            rel_offset = None
            if parent_id:
                parent = db.query(Video).filter(Video.id == parent_id).first()
                if parent and parent.sync_offset is not None:
                    rel_offset = round(approx_offset - parent.sync_offset, 2)

            record_video_calibration(
                db,
                video,
                sync_offset=round(approx_offset, 2),
                method="ai_setlist_macro_sync",
                status="ai_calibrated",
                parent_video_id=parent_id,
                relative_offset=rel_offset,
                commit=True
            )
            success_count += 1
            results.append({
                "video_id": video.id,
                "title": video.title,
                "previous_offset": prev_offset,
                "new_offset": video.sync_offset,
                "delta": round(video.sync_offset - prev_offset, 2),
                "reason": reason,
                "status": "success"
            })
        else:
            results.append({
                "video_id": video.id,
                "title": video.title,
                "previous_offset": prev_offset,
                "status": "failed",
                "reason": "위치 추정 실패"
            })

    return {
        "concert_id": concert_id,
        "total_audited_suspicious": len(candidates),
        "aligned_count": success_count,
        "results": results
    }

def audit_master_timeline_drifts(db: Session, concert_id: int) -> dict:
    """
    콘서트 내 1시간 이상의 풀 영상들(Full Concert Candidates) 간의 타임라인을 교차 검증하여,
    토크나 VCR 편집으로 인한 타임라인 단층(Cut Shift / Drift)을 자동 감지합니다.
    """
    import re

    long_videos = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.duration != None,
        Video.duration > 3600
    ).order_by(Video.duration.desc()).all()

    if len(long_videos) < 2:
        return {
            "concert_id": concert_id,
            "status": "insufficient_masters",
            "message": "비교 가능한 1시간 이상 풀 영상이 2개 미만입니다.",
            "drifts": []
        }

    # Reference master: longest duration video (e.g. #1094)
    ref_master = long_videos[0]
    comparisons = []

    pattern = re.compile(r'(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+([^\n\r]+)')

    for other in long_videos[1:]:
        # Compare chapter timestamps from descriptions if available
        ref_chapters = {}
        other_chapters = {}

        if ref_master.description:
            for line in ref_master.description.split('\n'):
                m = pattern.search(line)
                if m:
                    h = int(m.group(1)) if m.group(1) else 0
                    m_val = int(m.group(2))
                    s_val = int(m.group(3))
                    sec = h * 3600 + m_val * 60 + s_val
                    title = m.group(4).strip().upper()
                    if len(title) >= 3:
                        ref_chapters[title] = sec

        if other.description:
            for line in other.description.split('\n'):
                m = pattern.search(line)
                if m:
                    h = int(m.group(1)) if m.group(1) else 0
                    m_val = int(m.group(2))
                    s_val = int(m.group(3))
                    sec = h * 3600 + m_val * 60 + s_val
                    title = m.group(4).strip().upper()
                    if len(title) >= 3:
                        other_chapters[title] = sec

        common_keys = []
        for ok in other_chapters:
            for rk in ref_chapters:
                if (ok in rk or rk in ok) and len(ok) >= 4:
                    common_keys.append((ok, rk, other_chapters[ok], ref_chapters[rk]))
                    break

        drifts = []
        for ok, rk, o_sec, r_sec in common_keys:
            delta = round(r_sec - o_sec, 1)
            drifts.append({
                "song_or_event": ok,
                "other_time": o_sec,
                "ref_time": r_sec,
                "drift_cut_delta": delta
            })

        duration_diff = round((ref_master.duration or 0) - (other.duration or 0), 1)

        comparisons.append({
            "reference_master_id": ref_master.id,
            "reference_duration": ref_master.duration,
            "compared_video_id": other.id,
            "compared_title": other.title,
            "compared_duration": other.duration,
            "duration_difference_seconds": duration_diff,
            "has_cut_detected": abs(duration_diff) > 300.0,
            "chapter_drifts": drifts
        })

    return {
        "concert_id": concert_id,
        "status": "success",
        "reference_master_id": ref_master.id,
        "comparisons": comparisons
    }


