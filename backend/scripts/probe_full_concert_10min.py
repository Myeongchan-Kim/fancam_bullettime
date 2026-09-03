"""
Systematic 10-Minute Timeline Probe across Video 1094 (Uncut) and Video 63 (Edited).
Checks every 10-minute interval (0m, 10m, 20m, 30m, 40m, 50m, 60m, 70m, 80m, 90m, 100m, 110m, 120m...)
and identifies what is playing in both videos at that exact timestamp.
"""

import os
import sys
import dotenv
import subprocess
import scipy.signal
from scipy.io import wavfile
import numpy as np

dotenv.load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models.models import Video, ConcertSetlist

# Video 63 timestamp landmarks (YouTube Description Chapters)
V63_CHAPTERS = [
    (0, "Intro / VCR 1"),
    (223, "THIS IS FOR"),
    (387, "Strategy"),
    (554, "MAKE ME GO"),
    (774, "SET ME FREE"),
    (960, "I CAN'T STOP ME"),
    (1207, "OPTIONS"),
    (1397, "MOONLIGHT SUNRISE"),
    (1603, "MARS"),
    (1762, "I GOT YOU"),
    (1943, "The Feels"),
    (2202, "Gone"),
    (2441, "CRY FOR ME"),
    (2647, "HELL IN HEAVEN"),
    (2835, "RIGHT HAND GIRL"),
    (2983, "DIVE IN (Tzuyu Solo)"),
    (3091, "STONE COLD (Mina Solo)"),
    (3213, "MEEEEEE (Nayeon Solo)"),
    (3348, "FIX A DRINK (Jeongyeon Solo)"),
    (3455, "DAT AHH DAT OOH"),
    (3618, "BATTITUDE"),
    (3766, "CHESS (Dahyun Solo)"),
    (3899, "IN MY ROOM (Chaeyoung Solo)"),
    (3994, "ATM (Jihyo Solo)"),
    (4101, "DECAFFEINATED (Sana Solo)"),
    (4185, "MOVE LIKE THAT (Momo Solo)"),
    (4313, "FANCY"),
    (4534, "What Is Love?"),
    (4744, "YES or YES"),
    (4991, "Dance The Night Away"),
    (5303, "Feel Special"),
    (5518, "ONE SPARK"),
    (5750, "ONCE Random Dance"),
    (6120, "AFTER MOON"),
    (6330, "You In My Heart"),
    (6543, "ONCE-made VCR (GIRLS LIKE US)"),
    (6751, "One In A Million"),
    (6880, "Grateful Time (소감)"),
    (7140, "Encore Roulette"),
    (7312, "Talk that Talk (Encore)"),
    (7561, "Do It Again (Encore)"),
    (7799, "BDZ (Encore)"),
    (7967, "Ending & Bow"),
]

def get_v63_content_at(seconds: float) -> str:
    current = "Intro"
    for t, name in V63_CHAPTERS:
        if seconds >= t:
            current = name
        else:
            break
    return current

print("=" * 95)
print(f"{'시간(분)':<8} | {'Video 1094 재생초':<16} | {'Video 63 (편집본)':<32} | {'구간 설명 및 상태'}")
print("=" * 95)

# Check every 10 minutes (0m to 180m)
for minute in range(0, 181, 10):
    sec = minute * 60
    v63_item = get_v63_content_at(sec)
    time_fmt = f"{minute//60:02d}:{minute%60:02d}:00"
    print(f"{minute:>3}분 ({time_fmt}) | {sec:>5}초 ({sec//3600:02d}:{(sec%3600)//60:02d}:{sec%60:02d}) | {v63_item:<32} | ")
print("=" * 95)
