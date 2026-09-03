import os
import sys
import dotenv
import subprocess
from google import genai
from google.genai import types

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

client = genai.Client()
os.makedirs("scratch/10min_clips", exist_ok=True)

# 10-minute marks: 0m to 180m (in seconds)
marks = [m * 60 for m in range(0, 181, 10)]

prompt = """
Listen to this 10-second audio clip from TWICE's 2025 'THIS IS FOR' World Tour in Incheon Day 2.
Identify exactly what is happening in this audio clip:
1. Is it a specific song (e.g. 'THIS IS FOR', 'Strategy', 'SET ME FREE', 'I CAN'T STOP ME', 'MOONLIGHT SUNRISE', 'The Feels', 'CRY FOR ME', 'DIVE IN', 'MEEEEEE', 'FANCY', 'What Is Love?', 'YES or YES', 'Dance The Night Away', 'Feel Special', 'ONE SPARK', 'AFTER MOON', 'Talk that Talk', 'Do It Again', 'BDZ', etc.)?
2. Or is it a Talk Ment, VCR, Fan Sing-along, Random Play Dance, or Intro?

Respond ONLY in this format:
[Category]: [Name of Song or Event] (Brief reason / lyrics heard)
Example: Song: Feel Special (Chorus playing)
Example: Ment: Member Greeting Talk (Jihyo speaking to audience)
"""

print(f"=== Probing Video 1094 at 10-Minute Intervals with Gemini 3.8 Flash ===", flush=True)

for sec in marks:
    minute = sec // 60
    time_fmt = f"{minute//60:02d}:{minute%60:02d}:00"
    clip_path = f"scratch/10min_clips/v1094_{minute:03d}m.wav"
    
    if not os.path.exists(clip_path):
        cmd = [
            'yt-dlp',
            '--download-sections', f'*{sec}-{sec+10}',
            '-x', '--audio-format', 'wav',
            '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1',
            '-o', f'scratch/10min_clips/v1094_{minute:03d}m.%(ext)s',
            'https://www.youtube.com/watch?v=dxY6TEGf6fM'
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    if os.path.exists(clip_path):
        with open(clip_path, "rb") as f:
            audio_bytes = f.read()
            
        resp = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type="audio/wav"),
                prompt
            ]
        )
        ans = resp.text.strip().replace("\n", " ")
        print(f"⏱️ {minute:>3}분 ({time_fmt} / {sec:>5}초) | Video 1094: {ans}", flush=True)
    else:
        print(f"⏱️ {minute:>3}분 ({time_fmt} / {sec:>5}초) | Failed to download audio clip", flush=True)
