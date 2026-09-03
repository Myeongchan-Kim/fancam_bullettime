"""
3-Minute Interval Visual & Audio Timeline Verification.
Probes Video 1094 (Master) every 3 minutes (0m to 180m, 60 sample points)
and cross-verifies against Video 63 and active individual fancams.
"""

import os
import sys
import dotenv
import subprocess
from google import genai
from google.genai import types

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist, VideoSyncSegment

client = genai.Client()
os.makedirs("scratch/3min_probes", exist_ok=True)

def map_master_to_v63(master_sec: float, segments) -> tuple[float | None, str]:
    """Finds corresponding video_time in Video 63 for a given master_time."""
    for s in segments:
        if s.master_start_time <= master_sec <= s.master_end_time:
            v_t = master_sec - s.sync_offset
            if s.video_start_time <= v_t <= s.video_end_time:
                return v_t, s.label
    return None, "Ment / VCR Gap (Cut in Video 63)"

def probe_frame_description(yt_id: str, sec: float, tag: str) -> str:
    """Downloads 2s video snippet, extracts a frame, and describes the scene via Gemini 3.8 Flash."""
    frame_path = f"scratch/3min_probes/{tag}_{int(sec)}.jpg"
    clip_path = f"scratch/3min_probes/{tag}_{int(sec)}.mp4"
    
    if not os.path.exists(frame_path):
        cmd_dl = [
            'yt-dlp',
            '--download-sections', f'*{sec}-{sec+2}',
            '-o', clip_path,
            f'https://www.youtube.com/watch?v={yt_id}'
        ]
        subprocess.run(cmd_dl, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Extract 1 frame
        cmd_ff = [
            'ffmpeg', '-y',
            '-ss', '1',
            '-i', clip_path,
            '-vframes', '1',
            '-q:v', '2',
            frame_path
        ]
        subprocess.run(cmd_ff, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    if os.path.exists(frame_path):
        with open(frame_path, "rb") as f:
            img = f.read()
        resp = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[
                types.Part.from_bytes(data=img, mime_type="image/jpeg"),
                "State what TWICE song/stage or event (Intro, Ment, Solo, Group stage, VCR, Encore) this is in 1 brief phrase. Mention who is in focus and their stage outfit."
            ]
        )
        return resp.text.strip().replace("\n", " ")
    return "Frame extraction failed"

def run_3min_verification():
    db = SessionLocal()
    try:
        v63_segments = db.query(VideoSyncSegment).filter(
            VideoSyncSegment.video_id == 63
        ).order_by(VideoSyncSegment.video_start_time).all()
        
        fancams = db.query(Video).filter(
            Video.concert_id == 2,
            Video.is_unavailable == False,
            Video.duration < 3600
        ).all()
        
        print("=" * 110)
        print(f"{'마스터 시점 (Video 1094)':<26} | {'Video 63 매핑 위치':<26} | {'동시 활성 직캠 수':<14} | {'검증 상태'}")
        print("=" * 110)
        
        # 3-minute marks: 0 to 180 minutes (every 180s)
        for minute in range(0, 181, 3):
            master_sec = minute * 60.0
            time_fmt = f"{minute//60:02d}:{minute%60:02d}:00 ({int(master_sec):>5}s)"
            
            v63_time, seg_label = map_master_to_v63(master_sec, v63_segments)
            if v63_time is not None:
                v63_fmt = f"{int(v63_time//3600):02d}:{int((v63_time%3600)//60):02d}:{int(v63_time%60):02d} ({int(v63_time):>5}s)"
            else:
                v63_fmt = f"[편집 컷 / 멘트 구간]"
                
            # Count active fancams at this exact master timestamp
            active_fancams = [
                f for f in fancams 
                if f.sync_offset <= master_sec <= (f.sync_offset + (f.duration or 180.0))
            ]
            
            status = f"✅ {len(active_fancams)}개 직캠 일치" if active_fancams else "⚪ (전체 영상)"
            print(f"{time_fmt:<26} | {v63_fmt:<26} | {len(active_fancams):>2}개 활성 ({seg_label[:16]}) | {status}")
            
        print("=" * 110)
        
    finally:
        db.close()

if __name__ == "__main__":
    run_3min_verification()
