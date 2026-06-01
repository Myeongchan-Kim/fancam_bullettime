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
