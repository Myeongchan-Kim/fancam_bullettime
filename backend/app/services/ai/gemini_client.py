import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Sequence
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)

dotenv_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    ".env",
)
load_dotenv(dotenv_path)

FALLBACK_MODELS: List[str] = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]


def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))


def clean_json_response(text: str) -> str:
    """Strip markdown code fences from Gemini JSON response."""
    if not text:
        return ""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].strip().startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


def should_retry(exception: BaseException) -> bool:
    if isinstance(exception, APIError) and exception.code == 429:
        logger.warning("⏳ [Quota Exceeded] Gemini API Rate Limit hit. Waiting to retry...")
        return True
    return False


def parse_gemini_response(response: Any) -> Dict[str, Any]:
    if hasattr(response, "parsed") and response.parsed is not None:
        return response.parsed
    return json.loads(clean_json_response(response.text))


@retry(
    retry=retry_if_exception_type(APIError) | retry_if_exception_type(Exception),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=5, min=5, max=60),
    reraise=True,
)
def generate_json_sync(
    contents: Any,
    system_instruction: Optional[str] = None,
    temperature: Optional[float] = None,
    models: Optional[Sequence[str]] = None,
    client: Optional[genai.Client] = None,
) -> Dict[str, Any]:
    active_client = client or get_gemini_client()
    model_list = models or FALLBACK_MODELS
    last_exception: Optional[Exception] = None

    config_kwargs: Dict[str, Any] = {"response_mime_type": "application/json"}
    if system_instruction is not None:
        config_kwargs["system_instruction"] = system_instruction
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    for model_name in model_list:
        try:
            response = active_client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            return parse_gemini_response(response)
        except Exception as e:
            err = str(e)
            last_exception = e
            if "404" in err or "NOT_FOUND" in err:
                logger.warning("Model %s not found/unsupported. Skipping...", model_name)
                continue
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                logger.warning("Model %s hit quota limit. Trying next model after 2s...", model_name)
                time.sleep(2)
                continue
            raise e

    raise last_exception if last_exception else RuntimeError("All Gemini models failed")


@retry(
    retry=retry_if_exception_type(APIError) | retry_if_exception_type(Exception),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=5, min=5, max=60),
    reraise=True,
)
async def generate_json_async(
    contents: Any,
    system_instruction: Optional[str] = None,
    temperature: Optional[float] = None,
    models: Optional[Sequence[str]] = None,
    client: Optional[genai.Client] = None,
) -> Dict[str, Any]:
    active_client = client or get_gemini_client()
    model_list = models or FALLBACK_MODELS
    last_exception: Optional[Exception] = None

    config_kwargs: Dict[str, Any] = {"response_mime_type": "application/json"}
    if system_instruction is not None:
        config_kwargs["system_instruction"] = system_instruction
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    for model_name in model_list:
        try:
            response = await active_client.aio.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            return parse_gemini_response(response)
        except Exception as e:
            err = str(e)
            last_exception = e
            if "404" in err or "NOT_FOUND" in err:
                logger.warning("Async model %s not found/unsupported. Skipping...", model_name)
                continue
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                logger.warning("Async model %s hit quota limit. Trying next model after 2s...", model_name)
                await asyncio.sleep(2)
                continue
            raise e

    raise last_exception if last_exception else RuntimeError("All Gemini models failed")
