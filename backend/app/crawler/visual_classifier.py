import os
import json
import logging
import urllib.request
from typing import Optional, Dict, Any, List
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

# .env 파일 로드
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
load_dotenv(dotenv_path)

# 투어 데이터 로드
TOUR_DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tour_info.json")
try:
    with open(TOUR_DATA_PATH, "r", encoding="utf-8") as f:
        TOUR_DATA = json.load(f)
except Exception as e:
    logger.warning(f"Failed to load tour_info.json: {e}")
    TOUR_DATA = {"setlist": {"group_acts": [], "solo_stages": []}}

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

FALLBACK_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash"
]

def download_thumbnail(youtube_id: str) -> Optional[bytes]:
    """유튜브 썸네일 고화질 이미지 다운로드 (maxres -> sd -> hq 순서)"""
    urls = [
        f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg",
        f"https://img.youtube.com/vi/{youtube_id}/sddefault.jpg",
        f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"
    ]
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    data = response.read()
                    # 1000바이트 이하의 1x1 투명 플레이스홀더 이미지 제외
                    if len(data) > 1000:
                        return data
        except Exception:
            continue
    return None

def get_db_visual_guide() -> str:
    """DB의 Song 테이블에서 액트별 의상 및 무대 가이드를 동적으로 로드"""
    try:
        from app.db import SessionLocal
        from app.models.models import Song
        db = SessionLocal()
        try:
            songs_with_meta = db.query(Song).filter(
                (Song.act.isnot(None)) | (Song.stage_outfit.isnot(None))
            ).order_by(Song.act.asc(), Song.order.asc()).all()

            if not songs_with_meta:
                return ""

            act_dict = {}
            for s in songs_with_meta:
                act = s.act or "General"
                if act not in act_dict:
                    act_dict[act] = []
                outfit = f" - 착장: {s.stage_outfit}" if s.stage_outfit else ""
                notes = f" (특징: {s.visual_notes})" if s.visual_notes else ""
                solo_member = f"[{s.member_name} Solo] " if s.is_solo and s.member_name else ""
                act_dict[act].append(f"  • {solo_member}{s.name}{outfit}{notes}")

            guide_lines = []
            for act, items in act_dict.items():
                guide_lines.append(f"### {act}:")
                guide_lines.extend(items)
                guide_lines.append("")

            return "\n".join(guide_lines)
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to fetch visual guide from DB: {e}")
        return ""

def build_visual_prompt(title: str, description: str) -> str:
    db_guide = get_db_visual_guide()
    
    return f"""
You are a world-class K-pop and TWICE Concert visual stage analyst.
Analyze the provided YouTube video frame/thumbnail image with extreme visual precision, along with the title and description, to identify the exact song, concert act, and every detail of the performance.

### Analysis Instructions:
1. **Exhaustive Scene Description**: Describe every visual element in depth:
   - **Members & Outfits**: Specific clothing items, fabric/textures (leather, satin, denim, mesh), primary/accent colors, jewelry, hair style & color, footwear.
   - **Stage & Lighting**: Backdrop LED screen imagery/animations, overall lighting colors (e.g. crimson red, royal blue, warm amber), laser patterns, pyrotechnics/smoke/fog/confetti.
   - **Props & Dancers**: Any stage props (e.g. microphone stand, bed, chair, instruments), presence of backup dancers and their costumes.
   - **Choreography & Actions**: Key dance poses, formations, center member actions, or talking/singing gestures.
2. **Setlist & Ground Truth Matching**: Compare the analyzed scene against the TWICE Concert Visual Guide below to determine the exact song.

### TWICE Concert Stage & Costume Visual Guide (From Central DB Ground Truth):
{db_guide}

### Input Video Context:
- **Title**: {title}
- **Description Snippet**: {description[:300] if description else "None"}

### Output Schema (Pure JSON):
{{
  "detected_act": "Act 1 (Opening)" | "Act 2 (Solo)" | "Act 3 (Hits)" | "Act 4 (Encore/Talk)" | "Unknown",
  "detailed_scene_description": "Comprehensive, highly detailed 3-5 sentence description covering members, outfits, LED visuals, lighting colors, props, and actions.",
  "outfit_description": "Precise breakdown of member clothing, accessories, hair color, and footwear.",
  "stage_environment": "Detailed lighting colors, laser effects, LED screen content, and atmospheric effects (fog, sparks, confetti).",
  "choreography_or_action": "Key pose, dance movements, prop interactions, or member positioning.",
  "detected_members": ["Nayeon", "Momo", ...],
  "identified_song": "EXACT_SONG_NAME_OR_TALK",
  "candidate_songs": ["SONG_1", "SONG_2"],
  "confidence": 0.0 to 1.0,
  "reasoning": "Clear step-by-step rationale matching the detailed visual scene to the specific song in the visual guide."
}}
"""

def clean_json_response(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text

def should_retry(exception):
    if isinstance(exception, APIError) and exception.code == 429:
        logger.warning("⏳ [Rate Limit] Gemini API hit quota limit. Backing off...")
        return True
    return False

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    retry=retry_if_exception_type(APIError),
    reraise=True
)
def _call_gemini_vision(contents: list, model_name: str) -> str:
    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    return response.text

def classify_fancam_visually(
    youtube_id: str,
    title: str = "",
    description: str = "",
    image_bytes: Optional[bytes] = None
) -> Dict[str, Any]:
    """유튜브 썸네일 이미지 및 멀티모달 비주얼 분석을 통해 정확한 곡 및 액트 분류"""
    if not image_bytes:
        image_bytes = download_thumbnail(youtube_id)
        
    if not image_bytes:
        logger.warning(f"Could not download thumbnail for {youtube_id}")
        return {
            "detected_act": "Unknown",
            "outfit_description": "No image available",
            "detected_members": [],
            "identified_song": None,
            "candidate_songs": [],
            "confidence": 0.0,
            "reasoning": "Thumbnail download failed"
        }

    image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
    prompt = build_visual_prompt(title, description)
    contents = [image_part, prompt]

    for model_name in FALLBACK_MODELS:
        try:
            raw_response = _call_gemini_vision(contents, model_name)
            cleaned = clean_json_response(raw_response)
            result = json.loads(cleaned)
            return result
        except Exception as e:
            logger.warning(f"Visual classification model {model_name} failed: {e}")
            continue

    return {
        "detected_act": "Unknown",
        "outfit_description": "Analysis failed",
        "detected_members": [],
        "identified_song": None,
        "candidate_songs": [],
        "confidence": 0.0,
        "reasoning": "All Gemini vision models failed"
    }
