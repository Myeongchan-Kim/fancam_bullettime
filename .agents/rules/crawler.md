# AI Crawler & Timeline Synchronization Guidelines

---
name: crawler_and_sync_guidelines
title: AI Crawler and Timeline Synchronization Guidelines
activation: Model Decision
description: Apply this rule when interacting with youtube crawling, time synchronization, offset adjustments, or parsing concert setlists.
---

## 🤖 Crawler Operations and Master Sync Guide

### 1. Duplicate Prevention and Script Inventory Review
- Before writing any script or launching a crawler process, **always check the existing scripts** in `backend/` or `app.crawler/`.
- Many maintenance, synchronization, date-fixing, and duration-fetching scripts are already written (e.g., `fix_zero_offsets.py`, `ai_contributor_sync.py`, `normalize_timestamps.py`). Re-use or modify these scripts instead of creating redundant utilities.

### 2. Time Offset (`sync_offset`) Adjustment Logic
To achieve perfect "Bullet Time" multi-angle switching, all videos must align to a single **Master Timeline**.
- **Reference Point (0:00)**: The Master Timeline starts exactly at the very beginning of the concert (usually the first opening VCR or the exact beginning of the first lyric of the opening song).
- **sync_offset Meaning**: Represents the number of seconds from the concert start (Reference Point) to the very first frame of the fancam video.
  - *Example:* If a fancam starts exactly 10 minutes (600 seconds) after the concert begins, its `sync_offset` is `600`.
- **Direction of Adjustment**:
  - If the fancam is **faster** than the master video (shows action too early): **Increase** the `sync_offset` value.
  - If the fancam is **slower** than the master video (shows action too late): **Decrease** the `sync_offset` value.

### 3. Dynamic Timeline and Setlist Filtering
- When working on API response logic or slider navigation, implement dynamic song ordering:
  - If a specific `concert_id` is supplied, order video contents by `display_order` from `ConcertSetlist`.
  - If no specific concert is selected, fall back dynamically to global `Song.order`.

### 4. 🚨 Anti-Cheating & Zero-DB Simulation Mandate (CRITICAL)
- **절대 금지 (Zero-Tolerance Anti-Cheating):**
  1. 알고리즘/시뮬레이션 코드 내에서 평가 대상 비디오 ID(예: `vid == 1714`)를 하드코딩하는 행위 절대 금지.
  2. 사용자가 조정한 수동 참값(`ground_truth`, `sync_offset`)을 사전에 보고 알고리즘의 앵커/후보군 윈도우를 수동으로 끼워 넣는 행위(Data Leakage) 절대 금지.
  3. 시뮬레이션/벤치마크 단계에서 DB 라이브러리(`app.db`, `sqlalchemy`, `psycopg2`, `sqlite3`)를 직접 임포트하여 정답을 엿보는 행위 절대 금지.
- **상시 감사(Audit) 의무:**
  - 벤치마크 및 시뮬레이션 결과를 보고하기 전, 반드시 코드에 하드코딩된 ID나 누출된 파라미터가 있는지 자체 AST/코드 감사를 통과해야 하며, 감사 결과를 함께 명시한다.
