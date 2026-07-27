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
description = "0:00:00 Intro/FOUR\n0:03:07 THIS IS FOR\n0:05:30 Strategy\n0:08:22 MAKE ME GO\n0:11:55 SET ME FREE\n0:15:02 I CAN'T STOP ME"

print(f"Analyzing: {title}")
res = parse_fancam_metadata(title, channel, description)
print("Parsed Result:")
print(json.dumps(res, indent=2, ensure_ascii=False))
