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

def build_visual_prompt(title: str, description: str) -> str:
    group_songs_str = ", ".join(TOUR_DATA.get("setlist", {}).get("group_acts", []))
    solo_stages_str = ", ".join([f"{s['member']}({s['song']})" for s in TOUR_DATA.get("setlist", {}).get("solo_stages", [])])

    return f"""
You are a world-class K-pop and TWICE Concert visual stage analyst.
Analyze the provided YouTube video frame/thumbnail image, along with the title and description, to accurately identify which song and concert act is being performed.

### TWICE Concert Stage & Costume Visual Guide (Ground Truth):
1. **Act 1 (Opening / Heavy EDM & Fierce)**:
   - **Costumes**: Black leather, metallic silver/gold warrior armor, high boots, dramatic harness styling.
   - **Stage/Vibe**: Dark backdrop, fiery explosions, red/blue laser lighting, laser beams.
   - **Songs**: SET ME FREE, I CAN'T STOP ME, GO HARD, MORE & MORE, MOONLIGHT SUNRISE, BRAVE.

2. **Act 2 (Solo Stages - Unique Individual Outfits)**:
   - **Dahyun**: Piano performance / Elegant white gown / "Try"
   - **Tzuyu**: Black velvet sleeveless dress / Sensual chair dance / "Done for Me"
   - **Sana**: Metallic silver slip dress / Sleek high ponytail / "New Rules"
   - **Momo**: Red and black dance gear / High-energy pole dance / "MOVE"
   - **Mina**: Black sensual lace / Fedora / "7 rings"
   - **Chaeyoung**: Acoustic guitar / Casual chic / "My Guitar"
   - **Jihyo**: Rock star red leather / Electric guitar / "Nightmare" / "Killin' Me Good"
   - **Jeongyeon**: Colorful quirky retro suit / Recorder flute / "Juice"
   - **Nayeon**: Denim / Pop idol streetwear / "POP!" / "ABCD"

3. **Act 3 (Hit Songs & Formal Elegance)**:
   - **Costumes**: Pastel silk gowns, white/pink cocktail dresses, glamorous formal red dresses.
   - **Stage/Vibe**: Bright LED screens, flowers, grand palace backdrop, emotional lighting.
   - **Songs**: FEEL SPECIAL, CRY FOR ME, FANCY, THE FEELS, I GOT YOU, WHAT IS LOVE?, CHEER UP, LIKEY, KNOCK KNOCK, SCIENTIST, HEART SHAKER.

4. **Act 4 (Encore / Casual & Talk)**:
   - **Costumes**: Tour merchandise T-shirts (Black or White "THIS IS FOR" / "READY TO BE"), hoodies, hats, hair accessories, holding Candybong lightsticks.
   - **Stage/Vibe**: House lights on, interacting freely with fans, confetti everywhere, moving carts.
   - **Songs/Events**: TALK, ENCORE ROULETTE, TT (Encore), SIGNAL (Encore), DANCE THE NIGHT AWAY, CRAZY STUPID LOVE.

### Input Video Context:
- **Title**: {title}
- **Description Snippet**: {description[:300] if description else "None"}

### Output Schema (Pure JSON):
{{
  "detected_act": "Act 1 (Opening)" | "Act 2 (Solo)" | "Act 3 (Hits)" | "Act 4 (Encore/Talk)" | "Unknown",
  "outfit_description": "Brief description of clothing, colors, and hair",
  "detected_members": ["Nayeon", "Momo", ...],
  "identified_song": "EXACT_SONG_NAME_OR_TALK",
  "candidate_songs": ["SONG_1", "SONG_2"],
  "confidence": 0.0 to 1.0,
  "reasoning": "Clear explanation linking outfit/stage visuals to the identified song"
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
