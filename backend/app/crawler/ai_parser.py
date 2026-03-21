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
You are an expert at analyzing K-pop Fancam metadata. 
Your task is to analyze the given YouTube video title and channel name, and determine if it belongs to TWICE's 6th World Tour 'THIS IS FOR'.

Here is the Ground Truth Data for the tour:
- Tour: {TOUR_DATA['tour_name']}
- Schedule (Date & City): {schedule_str}
- Group Songs: {songs_str}
- Solo Stages: {solo_str}
- Members: Nayeon, Jeongyeon, Momo, Sana, Jihyo, Mina, Dahyun, Chaeyoung, Tzuyu

Rules:
1. Determine if the video is TWICE-related content (Fancam, Vlog, Airport, Interview, etc.).
2. If it is a fancam from TWICE's 6th World Tour 'THIS IS FOR', extract the 'date', 'city', 'songs', and 'member_focus' based on the text. Set 'is_valid_fancam' to true.
3. If it is TWICE-related but NOT a fancam from this specific tour (e.g., vlog, airport, interview, older tour), set 'is_valid_fancam' to true, but explicitly set 'city' to "Other" and 'songs' to [].
4. If it is NOT related to TWICE at all, set 'is_valid_fancam' to false.
5. If the video focuses on a specific member or a sub-unit, list their names in the 'members' array.
6. If it's a full group fancam with no specific focus, return all 9 members' names in the 'members' array: ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"].
7. Return the result STRICTLY as a valid JSON object without markdown formatting.

Expected JSON schema:
{{
  "is_valid_fancam": boolean,
  "date": "YYYY-MM-DD" (or null if unknown),
  "city": "City Name" (or "Other" if not from this tour),
  "songs": ["Song Title 1", "Song Title 2"] (Array of strings, empty if none),
  "members": ["Member1", "Member2"] (Array of strings),
  "category": "Group Stage", "Solo Stage", "Encore" or "Unknown"
}}
"""

def parse_fancam_metadata(title: str, channel_name: str) -> Optional[Dict[str, Any]]:
    """유튜브 영상 제목과 채널명을 입력받아 JSON 형태로 변환 반환"""
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash", 
            system_instruction=create_system_prompt(),
            generation_config={"response_mime_type": "application/json"}
        )
        
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}"
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
