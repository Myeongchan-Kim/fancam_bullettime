import os
import json
import logging
from typing import Optional, Dict, Any

from app.services.ai.gemini_client import (
    FALLBACK_MODELS,
    clean_json_response,
    should_retry,
    get_gemini_client,
    generate_json_sync,
    generate_json_async,
)

logger = logging.getLogger(__name__)

# 설정 파일 로드
TOUR_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
    TOUR_DATA = json.load(f)

client = get_gemini_client()


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
4. **Song Identification Rule**: Be careful to distinguish between the tour title ("THIS IS FOR") and the song title ("THIS IS FOR"). Only include "THIS IS FOR" in the 'songs' list if the video actually contains the performance of that song. If the title only uses it as part of the tour name (e.g., "THIS IS FOR Tour"), do not include it in 'songs'.
5. **Non-Song Events**: Also identify events like "Talk", "Ending", "Intro", "VCR", "Photo Time" if they are the main content of the video. Use these exact words for consistency.

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


async def parse_fancam_metadata_async(
    title: str, channel_name: str, description: str = ""
) -> Optional[Dict[str, Any]]:
    """(비동기) 유튜브 영상 제목, 채널명, 설명을 입력받아 JSON 형태로 변환 반환"""
    try:
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}\nDescription: {description}"
        return await generate_json_async(
            contents=user_prompt,
            system_instruction=create_system_prompt(),
            client=client,
        )
    except Exception as e:
        logger.error(f"[AI Parser Async Error] 최종 실패: {e}")
        return None


def parse_fancam_metadata(
    title: str, channel_name: str, description: str = ""
) -> Optional[Dict[str, Any]]:
    """유튜브 영상 제목, 채널명, 설명을 입력받아 JSON 형태로 변환 반환"""
    try:
        user_prompt = f"Video Title: {title}\nChannel Name: {channel_name}\nDescription: {description}"
        return generate_json_sync(
            contents=user_prompt,
            system_instruction=create_system_prompt(),
            client=client,
        )
    except Exception as e:
        logger.error(f"[AI Parser Error] 최종 실패: {e}")
        return None
