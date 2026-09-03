import os
import sys
import dotenv
from typing import List, Tuple

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.crawler.timeline_aligner import get_direct_audio_url, download_audio_slice, correlate_audio_slices

os.makedirs("scratch/audio_probe_latter", exist_ok=True)
v1094_url = get_direct_audio_url("dxY6TEGf6fM") # Video 1094 (Uncut 3h 3m)
v63_url = get_direct_audio_url("ZBjTY0h1fuc")   # Video 63 (Edited 2h 19m)

events = [
    ("Feel Special", 5303.0, 7500.0, 500.0),
    ("ONE SPARK", 5518.0, 7800.0, 500.0),
    ("AFTER MOON", 6120.0, 8300.0, 600.0),
    ("You In My Heart", 6330.0, 8500.0, 600.0),
    ("ONCE-made VCR: GIRLS LIKE US", 6543.0, 8700.0, 600.0),
    ("ONCE Sing along: One In A Million", 6751.0, 8900.0, 600.0),
    ("Encore Roulette", 7140.0, 9300.0, 700.0),
    ("Talk that Talk (Encore)", 7312.0, 9500.0, 700.0),
    ("Do It Again (Encore)", 7561.0, 9800.0, 700.0),
    ("BDZ (Encore)", 7799.0, 10100.0, 700.0),
]

print("=== Probing Latter Half Landmarks (Audio Cross-Correlation) ===", flush=True)
results = []
for name, v63_t, v1094_search_start, search_dur in events:
    ref_file = f"scratch/audio_probe_latter/ref_{name.replace(' ', '_').replace(':', '').replace('(', '').replace(')', '')}.wav"
    tgt_file = f"scratch/audio_probe_latter/tgt_{name.replace(' ', '_').replace(':', '').replace('(', '').replace(')', '')}.wav"
    
    # Download 15s reference from V63
    download_audio_slice(v63_url, v63_t + 10.0, 15.0, ref_file)
    # Download search chunk from V1094
    download_audio_slice(v1094_url, v1094_search_start, search_dur, tgt_file)
    
    matched_sec, score = correlate_audio_slices(ref_file, tgt_file, v1094_search_start)
    exact_v1094_t = matched_sec - 10.0
    delta = exact_v1094_t - v63_t
    
    v63_fmt = f"{int(v63_t//3600):02d}:{int((v63_t%3600)//60):02d}:{int(v63_t%60):02d}"
    v1094_fmt = f"{int(exact_v1094_t//3600):02d}:{int((exact_v1094_t%3600)//60):02d}:{int(exact_v1094_t%60):02d}"
    
    print(f"🎵 {name:<35} | V63: {v63_fmt} ({v63_t:5.0f}s) | V1094: {v1094_fmt} ({exact_v1094_t:5.0f}s) | Δ: {delta:+6.0f}s | Score: {score:.3f}", flush=True)
    results.append((name, v63_t, exact_v1094_t, v63_fmt, v1094_fmt, delta, score))

print("\nAll probing done!", flush=True)
