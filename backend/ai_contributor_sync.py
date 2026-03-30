import sys
import os
import json
import requests
import google.generativeai as genai
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from app.models.models import Video, Song, ConcertSetlist, Concert
from app.schemas.schemas import ContributionCreate

# .env 파일 로드
load_dotenv()

# API KEY 확인
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

DATABASE_URL = "sqlite:///twice_fancam.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000/api")

def get_gemini_suggestion(video: Video, setlist: List[ConcertSetlist]) -> Optional[Dict[str, Any]]:
    """Gemini를 사용하여 영상에 맞는 곡과 오프셋 제안 생성"""
    
    # 셋리스트 정보 구성
    setlist_info = []
    for item in setlist:
        song_name = item.song.name if item.song else item.event_name
        setlist_info.append({
            "id": item.song_id,
            "name": song_name,
            "start_time": item.start_time,
            "display_order": item.display_order
        })

    system_prompt = f"""
You are an expert at analyzing TWICE concert fancams.
Your task is to match a specific video to the correct song(s) from a concert setlist and identify featured members.

### Video Context:
- Video Title: {video.title}
- Video Description: {video.description[:200] if video.description else "No description"}
- Concert Info: {video.concert.city} ({video.concert.date.strftime('%Y-%m-%d') if video.concert.date else 'Unknown Date'})

### Ground Truth Setlist (Master Timeline):
{json.dumps(setlist_info, indent=2, ensure_ascii=False)}

### TWICE Members:
Nayeon, Jeongyeon, Momo, Sana, Jihyo, Mina, Dahyun, Chaeyoung, Tzuyu

### Critical Instructions:
1. **Keyword Match**: Scan the 'Video Title' for song names present in the 'Ground Truth Setlist'. If a song name from the setlist appears in the title (even with case differences), it is a HIGH-PROBABILITY match.
2. **Context Verification**: Verify if the video is actually from the provided 'Concert Info' (check for city names or dates like '260320' vs '2026-03-20' in the title).
3. **Extraction**:
   - `suggested_song_ids`: List of IDs of the matched songs from the setlist.
   - `suggested_sync_offset`: The EXACT 'start_time' of the first matched song from the setlist.
   - `suggested_members`: List of members featured (e.g., "Sana Focus" means suggest ["Sana"]). If no specific member is mentioned, and it looks like a group shot, list all 9 members.
4. **Reasoning**: Provide a short sentence explaining why you matched this song (e.g., "Title contains 'ONE SPARK' which matches setlist item #15").

Return the result in JSON format ONLY.

Expected JSON schema:
{{
  "match_found": boolean,
  "suggested_song_ids": [integer, ...],
  "suggested_sync_offset": float,
  "suggested_members": [string, ...],
  "reasoning": "brief explanation"
}}
"""
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash",
            generation_config={"response_mime_type": "application/json"}
        )
        
        response = model.generate_content(system_prompt)
        result = json.loads(response.text)
        return result
    except Exception as e:
        print(f"\n❌ Gemini API Error Details:")
        if "429" in str(e):
            print(f"   [QUOTA EXCEEDED] You have hit the rate limit for Gemini API (Free Tier).")
            print(f"   Please wait 30-60 seconds and try again.")
        print(f"   Full Error: {e}\n")
        return None

def contribute_ai_suggestion(video_id: int):
    db = SessionLocal()
    try:
        # 1. 영상 정보 가져오기
        video = db.query(Video).options(joinedload(Video.concert)).filter(Video.id == video_id).first()
        if not video:
            print(f"❌ Video {video_id} not found.")
            return

        if not video.concert_id:
            print(f"⚠️ Video {video_id} has no concert_id. Cannot match setlist.")
            return

        # 2. 콘서트 셋리스트 가져오기
        setlist = db.query(ConcertSetlist).options(joinedload(ConcertSetlist.song)).filter(
            ConcertSetlist.concert_id == video.concert_id
        ).order_by(ConcertSetlist.display_order).all()

        if not setlist:
            print(f"⚠️ No setlist found for concert {video.concert_id}.")
            return

        print(f"🔍 Analyzing Video [{video_id}]: {video.title}")
        print(f"🏟️ Concert: {video.concert.city if video.concert else 'Unknown'}")

        # 3. Gemini 제안 받기
        suggestion = get_gemini_suggestion(video, setlist)
        
        if not suggestion or not suggestion.get('match_found'):
            print("❌ No matching song found by Gemini.")
            return

        suggested_song_ids = suggestion.get('suggested_song_ids', [])
        suggested_sync_offset = suggestion.get('suggested_sync_offset', 0.0)
        suggested_members = suggestion.get('suggested_members', video.members or [])
        reason = suggestion.get('reasoning', "No reason provided")

        print(f"💡 AI Suggestion:")
        print(f"   - Song IDs: {suggested_song_ids}")
        print(f"   - Sync Offset: {suggested_sync_offset}")
        print(f"   - Members: {suggested_members}")
        print(f"   - Reasoning: {reason}")

        # 4. Contribution API 호출
        payload = {
            "suggested_title": video.title,
            "suggested_song_ids": suggested_song_ids,
            "suggested_concert_id": video.concert_id,
            "suggested_sync_offset": suggested_sync_offset,
            "suggested_members": suggested_members
        }

        try:
            url = f"{API_BASE_URL}/videos/{video_id}/contributions"
            resp = requests.post(url, json=payload)
            if resp.status_code == 200:
                print(f"✅ Contribution successfully submitted! ID: {resp.json().get('id')}")
            else:
                print(f"❌ API Error ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"❌ Connection Error: Could not reach API at {API_BASE_URL}. Is the server running?")
            print(f"   (You can start it with: uv run python -m app.main)")

    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: uv run python ai_contributor_sync.py <video_id>")
        sys.exit(1)
    
    video_id = int(sys.argv[1])
    contribute_ai_suggestion(video_id)
