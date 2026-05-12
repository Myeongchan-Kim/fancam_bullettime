import os
import json
import logging
from google import genai
from google.genai import types
from google.genai.errors import APIError
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# .env 파일 로드 (backend/.env)
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
load_dotenv(dotenv_path)

# 설정 파일 로드
TOUR_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
    TOUR_DATA = json.load(f)

# API KEY 확인 (환경변수 또는 .env에서 가져오기)
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

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

def clean_json_response(text: str) -> str:
    """Gemini 응답에서 Markdown 코드 블록 등을 제거하고 순수 JSON 문자열만 추출"""
    text = text.strip()
    if text.startswith("```"):
        # ```json ... ``` 또는 ``` ... ``` 블록 제거
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text

def should_retry(exception):
    """429 RESOURCE_EXHAUSTED 에러인지 확인하여 재시도 여부 결정"""
    if isinstance(exception, APIError):
        # google-genai SDK raises APIError with status 429
        if exception.code == 429:
            logger.warning(f"⏳ [Quota Exceeded] Gemini API Rate Limit hit. Waiting to retry...")
            return True
    return False

# 최대 5번 재시도, 대기 시간은 10초부터 시작해서 최대 60초까지 지수적으로 증가 (10, 20, 40, 60...)
@retry(
    retry=retry_if_exception_type(APIError) | retry_if_exception_type(Exception),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=10, min=10, max=65),
    reraise=True
)
async def _generate_content_async(user_prompt: str):
    return await client.aio.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=create_system_prompt(),
            response_mime_type="application/json"
        )
    )

async def parse_fancam_metadata_async(title: str, channel_name: str, description: str = "") -> Optional[Dict[str, Any]]:
    """(비동기) 유튜브 영상 제목, 채널명, 설명을 입력받아 JSON 형태로 변환 반환"""
    try:
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}\nDescription: {description}"
        response = await _generate_content_async(user_prompt)
        result_json = response.parsed if hasattr(response, 'parsed') else json.loads(clean_json_response(response.text))
        return result_json
    except Exception as e:
        logger.error(f"[AI Parser Async Error] 최종 실패: {e}")
        return None

# 최대 5번 재시도, 대기 시간은 10초부터 시작해서 최대 60초까지 지수적으로 증가
@retry(
    retry=retry_if_exception_type(APIError) | retry_if_exception_type(Exception),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=10, min=10, max=65),
    reraise=True
)
def _generate_content_sync(user_prompt: str):
    return client.models.generate_content(
        model="gemini-2.0-flash",
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=create_system_prompt(),
            response_mime_type="application/json"
        )
    )

def parse_fancam_metadata(title: str, channel_name: str, description: str = "") -> Optional[Dict[str, Any]]:
    """유튜브 영상 제목, 채널명, 설명을 입력받아 JSON 형태로 변환 반환"""
    try:
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}\nDescription: {description}"
        response = _generate_content_sync(user_prompt)
        result_json = response.parsed if hasattr(response, 'parsed') else json.loads(clean_json_response(response.text))
        return result_json
    except Exception as e:
        logger.error(f"[AI Parser Error] 최종 실패: {e}")
        return None

if __name__ == "__main__":
    # Test Code
    test_title = "260109 밴쿠버 트와이스 사나 직캠 DECAFFEINATED 4K"
    test_channel = "SanaFan96"
    print(f"Testing with: {test_title}")
    res = parse_fancam_metadata(test_title, test_channel)
    print("Parsed JSON:")
    print(json.dumps(res, indent=2, ensure_ascii=False))
