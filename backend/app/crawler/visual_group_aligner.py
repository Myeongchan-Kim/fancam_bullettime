import os
import sys
import json
import logging
import subprocess
from typing import Optional, Dict, Any, List, Tuple
from PIL import Image
import numpy as np
import imageio_ffmpeg
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

try:
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"

def get_direct_video_url(youtube_id: str) -> Optional[str]:
    """Extract low-resolution (360p or lower) direct streaming video URL using yt-dlp."""
    try:
        url = f"https://www.youtube.com/watch?v={youtube_id}"
        cmd = ["yt-dlp", "-g", "-f", "134/18/bestvideo[height<=360]/best[height<=360]", url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout.strip().splitlines()[0]
        else:
            logger.warning(f"yt-dlp failed for video stream {youtube_id}: {res.stderr}")
    except Exception as e:
        logger.warning(f"Failed to get video URL for {youtube_id}: {e}")
    return None

def extract_frame(video_url: str, timestamp_sec: float, out_img_path: str) -> bool:
    """Extract a single frame snapshot at a given timestamp using fast ffmpeg seek."""
    try:
        os.makedirs(os.path.dirname(out_img_path), exist_ok=True)
        cmd = [
            FFMPEG_EXE, "-y",
            "-ss", str(max(0.0, timestamp_sec)),
            "-i", video_url,
            "-vframes", "1",
            "-q:v", "3",
            out_img_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
        return os.path.exists(out_img_path) and os.path.getsize(out_img_path) > 1000
    except Exception as e:
        logger.warning(f"Failed to extract frame at {timestamp_sec}s: {e}")
        return False

def compute_color_histogram(img_path: str, bins: int = 8) -> Optional[np.ndarray]:
    """Compute normalized 3D RGB color histogram for fast structural scene filtering."""
    try:
        with Image.open(img_path) as img:
            rgb_img = img.convert("RGB").resize((160, 90))
            arr = np.array(rgb_img)
            # 8x8x8 bins across R, G, B
            hist, _ = np.histogramdd(
                arr.reshape(-1, 3),
                bins=(bins, bins, bins),
                range=[(0, 256), (0, 256), (0, 256)]
            )
            hist = hist / (hist.sum() + 1e-7)
            return hist.flatten()
    except Exception as e:
        logger.warning(f"Failed to compute histogram for {img_path}: {e}")
        return None

def find_visual_group_location(
    master_youtube_id: str,
    fancam_youtube_ids: List[str],
    search_window: Optional[Tuple[float, float]] = None,
    master_interval_sec: float = 60.0,
    fancam_sample_offset_sec: float = 30.0,
    cache_dir: str = "scratch/visual_align",
    use_gemini_verification: bool = True
) -> Dict[str, Any]:
    """
    Locates the coarse position (seconds) of a group of fancams on the master video timeline.
    
    1. Extracts 1 frame from each fancam (at fancam_sample_offset_sec).
    2. Extracts candidate master frames across search_window (or the whole concert) at master_interval_sec intervals.
    3. Ranks candidate master timestamps using visual color/scene similarity.
    4. (Optional) Prompts Gemini Vision to confirm the best matching stage/costume/member time block.
    
    Returns:
        {
            "best_master_time": float,
            "confidence": float,
            "candidates": List[Dict[str, Any]],
            "verified_by": str
        }
    """
    os.makedirs(cache_dir, exist_ok=True)
    master_cache_dir = os.path.join(cache_dir, f"master_{master_youtube_id}")
    fancam_cache_dir = os.path.join(cache_dir, "fancam_samples")
    os.makedirs(master_cache_dir, exist_ok=True)
    os.makedirs(fancam_cache_dir, exist_ok=True)

    # 1. Obtain stream URLs
    logger.info("🎬 Fetching stream URLs for master and fancam group...")
    master_vurl = get_direct_video_url(master_youtube_id)
    if not master_vurl:
        return {"success": False, "error": f"Failed to get video URL for master {master_youtube_id}"}

    # 2. Extract 1 sample frame from each fancam in the group
    fancam_samples = []
    for yid in fancam_youtube_ids[:5]: # Take up to 5 fancams for group fingerprinting
        f_vurl = get_direct_video_url(yid)
        if not f_vurl:
            continue
        out_fancam_path = os.path.join(fancam_cache_dir, f"{yid}_{int(fancam_sample_offset_sec)}s.jpg")
        if not os.path.exists(out_fancam_path):
            ok = extract_frame(f_vurl, fancam_sample_offset_sec, out_fancam_path)
            if not ok:
                continue
        hist = compute_color_histogram(out_fancam_path)
        if hist is not None:
            fancam_samples.append({
                "youtube_id": yid,
                "img_path": out_fancam_path,
                "hist": hist
            })

    if not fancam_samples:
        return {"success": False, "error": "Failed to extract frames from fancams"}

    # Compute average visual histogram across the fancam group
    group_hist = np.mean([s["hist"] for s in fancam_samples], axis=0)

    # 3. Determine master search interval
    start_t, end_t = search_window if search_window else (0.0, 11000.0)
    master_timestamps = np.arange(start_t, end_t, master_interval_sec)

    logger.info(f"🎞️ Sampling {len(master_timestamps)} master frames from {start_t}s to {end_t}s...")
    candidate_scores = []

    for t in master_timestamps:
        out_master_path = os.path.join(master_cache_dir, f"frame_{int(t)}s.jpg")
        if not os.path.exists(out_master_path):
            ok = extract_frame(master_vurl, float(t), out_master_path)
            if not ok:
                continue
        m_hist = compute_color_histogram(out_master_path)
        if m_hist is not None:
            # Cosine similarity between group histogram and master frame
            sim = float(np.dot(group_hist, m_hist) / (np.linalg.norm(group_hist) * np.linalg.norm(m_hist) + 1e-7))
            candidate_scores.append({
                "timestamp": float(t),
                "similarity": sim,
                "img_path": out_master_path
            })

    if not candidate_scores:
        return {"success": False, "error": "No valid master frames extracted"}

    # Sort candidates by visual similarity descending
    candidate_scores.sort(key=lambda x: x["similarity"], reverse=True)
    top_candidates = candidate_scores[:5]

    best_match = top_candidates[0]

    # 4. Optional Gemini Vision Multi-image verification among top candidates
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if use_gemini_verification and gemini_key and len(top_candidates) > 1:
        try:
            client = genai.Client(api_key=gemini_key)
            prompt_parts = [
                "다음은 동일한 콘서트의 [직캠 화면]들과, 풀 콘서트(마스터) 영상의 [후보 타임스탬프 스크린샷]들입니다.",
                "직캠에 등장하는 멤버의 무대 의상(색상, 소재), 헤어, 무대 조명 및 배경 스크린을 종합적으로 비교해주세요.",
                "마스터 후보들 중 직캠과 가장 동일한 무대/곡 구간인 후보 번호(Candidate 1, 2, 3...)와 이유를 JSON으로 답변해주세요.",
                "형식: { \"best_candidate_index\": 0, \"reason\": \"의상(블랙 드레스)과 조명이 일치함\" }"
            ]

            # Attach representative fancam frame
            with open(fancam_samples[0]["img_path"], "rb") as f:
                prompt_parts.append(types.Part.from_bytes(data=f.read(), mime_type="image/jpeg"))

            # Attach top 3 master candidate frames
            for idx, c in enumerate(top_candidates[:3]):
                with open(c["img_path"], "rb") as f:
                    prompt_parts.append(types.Part.from_bytes(data=f.read(), mime_type="image/jpeg"))

            res = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt_parts,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            parsed = json.loads(res.text)
            sel_idx = int(parsed.get("best_candidate_index", 0))
            if 0 <= sel_idx < len(top_candidates[:3]):
                best_match = top_candidates[sel_idx]
                return {
                    "success": True,
                    "best_master_time": best_match["timestamp"],
                    "confidence": best_match["similarity"],
                    "reason": parsed.get("reason"),
                    "candidates": top_candidates,
                    "verified_by": "gemini_multimodal"
                }
        except Exception as e:
            logger.warning(f"Gemini verification fallback to top histogram match: {e}")

    return {
        "success": True,
        "best_master_time": best_match["timestamp"],
        "confidence": best_match["similarity"],
        "candidates": top_candidates,
        "verified_by": "histogram_similarity"
    }
