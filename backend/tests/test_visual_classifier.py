import pytest
from unittest.mock import patch, MagicMock
from app.crawler.visual_classifier import (
    build_visual_prompt,
    clean_json_response,
    classify_fancam_visually
)

def test_clean_json_response():
    raw_markdown = """```json
    {
      "detected_act": "Act 1 (Opening)",
      "identified_song": "SET ME FREE",
      "confidence": 0.95
    }
    ```"""
    cleaned = clean_json_response(raw_markdown)
    assert cleaned.startswith("{")
    assert cleaned.endswith("}")

def test_build_visual_prompt():
    prompt = build_visual_prompt("TWICE Nayeon Fancam", "Live in Incheon")
    assert "Act 1" in prompt
    assert "Act 2" in prompt
    assert "Act 3" in prompt
    assert "Act 4" in prompt
    assert "TWICE Nayeon Fancam" in prompt

@patch("app.crawler.visual_classifier._call_gemini_vision")
@patch("app.crawler.visual_classifier.download_thumbnail")
def test_classify_fancam_visually(mock_download, mock_call_gemini):
    mock_download.return_value = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 2000
    mock_call_gemini.return_value = """{
        "detected_act": "Act 3 (Hits)",
        "outfit_description": "Pastel silk dress",
        "detected_members": ["Nayeon"],
        "identified_song": "FEEL SPECIAL",
        "candidate_songs": ["FEEL SPECIAL", "FANCY"],
        "confidence": 0.95,
        "reasoning": "Pastel gown outfit indicates Act 3 Feel Special performance."
    }"""

    result = classify_fancam_visually(
        youtube_id="mock_id_123",
        title="240416 TWICE Incheon Fancam",
        description="Nayeon fancam"
    )

    assert result["detected_act"] == "Act 3 (Hits)"
    assert result["identified_song"] == "FEEL SPECIAL"
    assert result["confidence"] == 0.95
    assert "Nayeon" in result["detected_members"]
