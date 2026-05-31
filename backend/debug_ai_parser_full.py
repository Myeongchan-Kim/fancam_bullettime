import sys
import os
import json
import logging

# 프로젝트 루트를 path에 추가
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.crawler.ai_parser import parse_fancam_metadata

logging.basicConfig(level=logging.INFO)

title = 'TWICE - THIS IS FOR Tour - full concert live in Berlin 2026 Germany [FIRST ROW VIP]'
channel = 'Concerts That Make Me Woah'
description = """0:00:00 Intro/FOUR
0:03:07 THIS IS FOR
0:05:30 Strategy
0:08:22 MAKE ME GO
0:11:55 SET ME FREE
0:15:02 I CAN'T STOP ME
0:18:53 MENT 1
0:25:55 OPTIONS
0:29:28 MOONLIGHT SUNRISE
0:32:35 Dancers
0:36:40 MARS
0:39:20 I GOT YOU
0:42:15 The Feels
0:45:40 MENT 2
0:50:02 Gone
0:54:05 CRY FOR ME
0:57:33 HELL IN HEAVEN
1:00:34 RIGHT HAND GIRL
1:03:21 Run Away (TZUYU solo)
1:05:40 STONE COLD (Mina solo)
1:07:52 MEEEEEE (Nayeon solo)
1:10:05 FIX A DRINK (Jeongyeong solo)
1:12:10 CHESS (Dahyun solo)
1:14:20 SHOOT (Firecracker) (CHAEYOUNG solo)
1:16:35 ATM (Jihyo solo)
1:18:30 DECAFFEINATED (Sana solo)
1:20:35 MOVE LIKE THAT(Momo solo)
1:22:15 TAKEDOWN 
1:29:00 FANCY
1:32:45 What is Love?
1:36:10 YES or YES
1:40:18 Dance the Night Away
1:43:30 MENT 3
1:47:36 ONE SPARK
1:51:36 Feel Special
1:55:03 MENT 4
2:01:40 Likey"""

print(f"Analyzing: {title}")
res = parse_fancam_metadata(title, channel, description)
print("Parsed Result:")
print(json.dumps(res, indent=2, ensure_ascii=False))
