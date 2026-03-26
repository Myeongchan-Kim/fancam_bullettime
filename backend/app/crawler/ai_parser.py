import os
import json
import google.generativeai as genai
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# .env 파일 로드 (backend/.env)
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
load_dotenv(dotenv_path)

# 설정 파일 로드
TOUR_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
    TOUR_DATA = json.load(f)

# API KEY 확인 (환경변수 또는 .env에서 가져오기)
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

def create_system_prompt() -> str:
    """투어 데이터 및 셋리스트를 포함한 LLM 시스템 프롬프트 생성"""
    schedule_str = ", ".join([f"{s['date']} {s['city']}" for s in TOUR_DATA["schedule"]])
    songs_str = ", ".join(TOUR_DATA["setlist"]["group_acts"])
    solo_str = ", ".join([f"{s['member']}({s['song']})" for s in TOUR_DATA["setlist"]["solo_stages"]])
    
    return f"""
You are an expert at analyzing K-pop Fancam metadata and concert setlists.
Your task is to analyze the given YouTube video title, channel name, or video description.

### Task 1: Basic Metadata Extraction
When given a 'Video Title' and 'Channel Name', determine if it belongs to TWICE's 6th World Tour 'THIS IS FOR'.
Rules:
1. Extract 'date', 'city', 'songs', and 'member_focus'.
2. Return 'is_valid_fancam': true if it belongs to this tour.
3. If it's a full group fancam, 'members' should be all 9 members.

### Task 2: Setlist & Timestamp Extraction
When given a 'Video Description', extract the setlist and timestamps if available.
Rules:
1. Identify all songs and their starting timestamps (HH:MM:SS or MM:SS).
2. Map song names to the provided Ground Truth Data below where possible.
3. If it's a "Full Concert" video, look for the 'Act' or 'Part' structure.
4. If timestamps are found, return them in the 'setlist' array.

Ground Truth Data:
- Tour: {TOUR_DATA['tour_name']}
- Schedule: {schedule_str}
- Group Songs: {songs_str}
- Solo Stages: {solo_str}
- Members: Nayeon, Jeongyeon, Momo, Sana, Jihyo, Mina, Dahyun, Chaeyoung, Tzuyu

Expected JSON schema:
{{
  "is_valid_fancam": boolean,
  "date": "YYYY-MM-DD",
  "city": "City Name",
  "songs": ["Song Title 1", ...],
  "members": ["Member1", ...],
  "is_full_concert": boolean,
  "setlist": [
    {{ "song_name": "Song Title", "timestamp": "HH:MM:SS" or "MM:SS" }},
    ...
  ]
}}
"""

def parse_fancam_metadata(title: str, channel_name: str, description: str = "") -> Optional[Dict[str, Any]]:
    """유튜브 영상 제목, 채널명, 설명을 입력받아 JSON 형태로 변환 반환"""
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash", 
            system_instruction=create_system_prompt(),
            generation_config={"response_mime_type": "application/json"}
        )
        
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}\nDescription: {description}"
        response = model.generate_content(user_prompt)
        
        result_json = json.loads(response.text)
        return result_json
        
    except Exception as e:
        print(f"[AI Parser Error] {e}")
        return None

if __name__ == "__main__":
    # Test Code
    test_title = "260109 밴쿠버 트와이스 사나 직캠 DECAFFEINATED 4K"
    test_channel = "SanaFan96"
    print(f"Testing with: {test_title}")
    res = parse_fancam_metadata(test_title, test_channel)
    print("Parsed JSON:")
    print(json.dumps(res, indent=2, ensure_ascii=False))
