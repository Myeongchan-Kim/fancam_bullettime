"""
Universal Concert Timeline Calibrator & Multi-Angle Sync Engine.
Calibrates Master Concert Timelines, generates piecewise VideoSyncSegments,
runs 3-Point Anchor Precision Audio Sync, and verifies sync alignment.

Usage Examples:
  # 1. Calibrate single concert with precision 3-point audio matching
  python backend/scripts/calibrate_all_concerts.py --concert-id 1 --precision

  # 2. Verify 3-minute interval alignment for a concert
  python backend/scripts/calibrate_all_concerts.py --concert-id 1 --verify --step 3

  # 3. Calibrate all registered concerts in the database
  python backend/scripts/calibrate_all_concerts.py --all --precision
"""

import os
import sys
import argparse
import datetime
import dotenv
import subprocess
import numpy as np
import scipy.signal
from scipy.io import wavfile

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Concert, Video, ConcertSetlist, Song, VideoSyncSegment
from scripts.precision_sync_calibrator import calibrate_video_3point

def propagate_fancam_offsets(db, concert_id: int) -> int:
    """Propagate setlist start_time to individual fancams (duration < 3600s)."""
    setlist_items = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == concert_id
    ).order_by(ConcertSetlist.display_order).all()
    
    song_to_time = {it.song_id: it.start_time for it in setlist_items if it.song_id and it.start_time is not None}
    
    fancams = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.is_unavailable == False,
        Video.duration < 3600
    ).all()
    
    updated_count = 0
    for v in fancams:
        if v.songs:
            for s in v.songs:
                if s.id in song_to_time:
                    v.sync_offset = round(float(song_to_time[s.id]), 1)
                    updated_count += 1
                    break
    db.commit()
    return updated_count

def verify_concert_timeline(db, concert_id: int, step_minutes: int = 3):
    """Generates a 3-minute interval verification table for a concert."""
    concert = db.query(Concert).filter(Concert.id == concert_id).first()
    if not concert:
        print(f"❌ Concert ID {concert_id} not found.")
        return
        
    full_vids = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.is_unavailable == False,
        Video.duration >= 3600
    ).order_by(Video.duration.desc()).all()
    
    if not full_vids:
        print(f"⚠️ No full concert video found for Concert {concert_id} ({concert.city}).")
        return
        
    master_vid = full_vids[0]
    sec_vids = full_vids[1:]
    
    fancams = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.is_unavailable == False,
        Video.duration < 3600
    ).all()
    
    max_duration = int(master_vid.duration or 10800)
    total_minutes = max_duration // 60
    
    print("\n" + "=" * 115)
    print(f"📊 3-Minute Interval Verification: Concert {concert_id} - {concert.city} ({concert.date.strftime('%Y-%m-%d') if concert.date else ''})")
    print(f"   Master Video: ID {master_vid.id} ({master_vid.duration/60:.0f}m - '{master_vid.title[:45]}')")
    if sec_vids:
        sec_info = ", ".join([f"ID {v.id} ({v.duration/60:.0f}m)" for v in sec_vids])
        print(f"   Secondary Full Videos: {sec_info}")
    print("=" * 115)
    print(f"{'마스터 시점':<24} | {'보조 풀영상 매핑 위치':<26} | {'동시 활성 직캠 수':<16} | {'동기화 상태'}")
    print("-" * 115)
    
    v_segments = db.query(VideoSyncSegment).filter(
        VideoSyncSegment.video_id.in_([v.id for v in sec_vids])
    ).all() if sec_vids else []
    
    for m in range(0, total_minutes + 1, step_minutes):
        m_sec = m * 60.0
        time_fmt = f"{m//60:02d}:{m%60:02d}:00 ({int(m_sec):>5}s)"
        
        # Mapped position in secondary video
        sec_mapped = []
        for s in v_segments:
            if s.master_start_time <= m_sec <= s.master_end_time:
                v_t = m_sec - s.sync_offset
                if s.video_start_time <= v_t <= s.video_end_time:
                    fmt = f"{int(v_t//3600):02d}:{int((v_t%3600)//60):02d}:{int(v_t%60):02d} ({s.label[:10]})"
                    sec_mapped.append(fmt)
                    break
        sec_str = sec_mapped[0] if sec_mapped else "[편집 컷 / 멘트 구간]" if sec_vids else "N/A"
        
        active_fancams = [
            f for f in fancams 
            if f.sync_offset <= m_sec <= (f.sync_offset + (f.duration or 180.0))
        ]
        
        status = f"✅ {len(active_fancams)}개 직캠 일치" if active_fancams else "⚪ (전체 영상)"
        print(f"{time_fmt:<24} | {sec_str:<26} | {len(active_fancams):>2}개 활성          | {status}")
        
    print("=" * 115 + "\n")

def calibrate_single_concert(db, concert_id: int, precision: bool = False, auto_verify: bool = True):
    """Main calibration pipeline for a single concert."""
    concert = db.query(Concert).filter(Concert.id == concert_id).first()
    if not concert:
        print(f"❌ Concert ID {concert_id} not found.")
        return
        
    print(f"\n=======================================================")
    print(f"🎬 Calibrating Concert {concert_id}: {concert.city} ({concert.date.strftime('%Y-%m-%d') if concert.date else ''})")
    print(f"=======================================================")
    
    # 1. Fetch full videos and setlist
    full_vids = db.query(Video).filter(
        Video.concert_id == concert_id,
        Video.is_unavailable == False,
        Video.duration >= 3600
    ).order_by(Video.duration.desc()).all()
    
    setlist_items = db.query(ConcertSetlist).filter(
        ConcertSetlist.concert_id == concert_id
    ).order_by(ConcertSetlist.display_order).all()
    
    if not full_vids:
        print(f"⚠️ No full concert video found for Concert {concert_id}. Calibrating based on default setlist order...")
        propagated = propagate_fancam_offsets(db, concert_id)
        print(f"✅ Propagated {propagated} fancams to default setlist.")
        return
        
    master_vid = full_vids[0]
    print(f"👑 Master Continuous Video: ID {master_vid.id} (Duration: {master_vid.duration/60:.1f}m - '{master_vid.title[:45]}')")
    
    # 2. Master Sync Segments
    db.query(VideoSyncSegment).filter(VideoSyncSegment.video_id == master_vid.id).delete()
    for i, item in enumerate(setlist_items):
        s_name = item.song.name if item.song else (item.event_name or f"Track {item.display_order}")
        m_start = float(item.start_time or 0.0)
        m_end = float(setlist_items[i+1].start_time) if i + 1 < len(setlist_items) and setlist_items[i+1].start_time is not None else (m_start + 180.0)
        if m_end <= m_start:
            m_end = m_start + 180.0
            
        seg = VideoSyncSegment(
            video_id=master_vid.id,
            setlist_id=item.id,
            video_start_time=m_start,
            video_end_time=m_end,
            master_start_time=m_start,
            master_end_time=m_end,
            sync_offset=0.0,
            label=s_name,
            is_verified=True
        )
        db.add(seg)
    db.commit()
    print(f"✅ Master Video ID {master_vid.id}: {len(setlist_items)} timeline segments synchronized.")
    
    # 3. Propagate baseline offsets to all fancams
    propagated = propagate_fancam_offsets(db, concert_id)
    print(f"🌳 Propagated baseline offsets to {propagated} individual fancams.")
    
    # 4. Optional 3-Point Precision Waveform Audio Matching & Split Timeline
    if precision:
        fancams = db.query(Video).filter(
            Video.concert_id == concert_id,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        print(f"\n🔍 Running 3-Point Precision Waveform Matching on {len(fancams)} fancams...")
        for v in fancams:
            if v.sync_offset and v.sync_offset > 0:
                calibrate_video_3point(db, v, master_vid, expected_master_center=v.sync_offset, search_radius=300.0)
                
    # 5. Verify
    if auto_verify:
        verify_concert_timeline(db, concert_id, step_minutes=3)

def main():
    parser = argparse.ArgumentParser(description="Universal Concert Timeline Calibrator")
    parser.add_argument("--concert-id", type=int, help="Specific Concert ID to calibrate")
    parser.add_argument("--all", action="store_true", help="Calibrate all registered concerts")
    parser.add_argument("--propagate-all", action="store_true", help="Propagate offsets to all fancams across all concerts")
    parser.add_argument("--precision", action="store_true", help="Run sub-second 3-point audio cross-correlation & split timeline")
    parser.add_argument("--verify", action="store_true", help="Run 3-minute interval verification")
    parser.add_argument("--step", type=int, default=3, help="Verification step in minutes (default: 3)")
    
    args = parser.parse_args()
    db = SessionLocal()
    
    try:
        if args.propagate_all:
            concerts = db.query(Concert).all()
            total_updated = 0
            for c in concerts:
                total_updated += propagate_fancam_offsets(db, c.id)
            print(f"🎉 Successfully propagated offsets to {total_updated} fancams across {len(concerts)} concerts!")
            
        elif args.concert_id:
            if args.verify:
                verify_concert_timeline(db, args.concert_id, step_minutes=args.step)
            else:
                calibrate_single_concert(db, args.concert_id, precision=args.precision, auto_verify=True)
                
        elif args.all:
            concerts = db.query(Concert).order_by(Concert.id).all()
            print(f"🚀 Starting Universal Calibration across {len(concerts)} Concerts...")
            for c in concerts:
                v_count = db.query(Video).filter(Video.concert_id == c.id, Video.is_unavailable == False).count()
                if v_count > 0:
                    calibrate_single_concert(db, c.id, precision=args.precision, auto_verify=False)
            print("🎉 Universal Multi-Concert Calibration Completed!")
            
        else:
            parser.print_help()
            
    finally:
        db.close()

if __name__ == "__main__":
    main()
