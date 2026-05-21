# TWICE World Tour 360° Fancam Archive - Shared Agent Memory

## 🧠 Agent Instruction Hierarchy
This project uses a unified instruction system via symbolic links to ensure all AI assistants share the exact same core memory and rules:
- **`AGENTS.md`**: The master file containing all universal core mandates, technical standards, and safety rules.
- **`GEMINI.md`** & **`CLAUDE.md`**: These are **symbolic links** pointing to `AGENTS.md`. Do not modify them directly; any changes to the agent memory must be made in `AGENTS.md`.

---

## 🛠️ Core Principles & Mandates
- **CRITICAL: NEVER DELETE `backend/twice_fancam.db`**. Contains live gathered data. Always verify file size > 0 before operations.
- **Branch Strategy (STRICT):** `main` is the **Live Production Deployment Branch** via Vercel. **ABSOLUTELY NO DIRECT COMMITS TO `main` ARE ALLOWED.** You must always create a new branch (`feat/`, `fix/`, `docs/`) and use Pull Requests.
- **Merge Protocol:** Merging to `main` requires explicit user approval and a passing CI/Pre-push hook status.
- **Always use `uv`** for all Python/Backend operations.
- **Data Integrity:** 
  - `Song.is_solo` must be `bool` (non-nullable).
  - JSON fields (`members`, `suggested_song_ids`) must use `JSONEncodedList` ORM type.
  - Always use `ensure_list` failsafe in API layers to handle SQLite JSON quirks.
  - **MANDATORY API ABSTRACTION:** Never modify the database directly (SQL/SQLAlchemy) for data contribution or updates. All agents and scripts must use the REST API endpoints (e.g., `POST /api/contributions`) to ensure validation, consistency, and compatibility with the distributed architecture (Vercel + Supabase).

## 🏗️ High-Level Architecture
- **Backend:** FastAPI + SQLAlchemy (SQLite/Supabase).
- **Frontend:** React 19 + TypeScript + Tailwind CSS v4.
- **Crawler:** 3-step pipeline (Search -> Chain/Async -> Importer).
- **Dynamic Filtering:** API filters by `ConcertSetlist.display_order` if a concert is selected, else falls back to `Song.order`.

## 🚀 Key Commands
- **Start Backend:** `cd backend && uv run python -m app.main`
- **Start Frontend:** `cd frontend && npm run dev`
- **Run Crawler (Step 1):** `cd backend && uv run python -m app.crawler.step1_search`
- **Run Crawler (Step 2):** `cd backend && uv run python -m app.crawler.step2_recommendation`
- **Run Full Importer:** `cd backend && uv run python -m app.crawler.full_concert_importer`

*See `ARCHITECTURE.md` for full technical details.*

---

## 📜 Script Inventory (Backend Tools)
기존에 작성된 주요 파이썬 스크립트 리스트입니다. 중복 작업을 방지하기 위해 실행 전 확인하세요.

### 1. Crawler & Importer (수집 관련)
- **`app.crawler.step1_search`**: 지정된 도시/콘서트 키워드로 유튜브를 검색하여 후보 영상들을 수집합니다.
- **`app.crawler.step2_recommendation`**: 수집된 후보 영상들을 AI(Gemini)가 분석하여 곡명, 멤버, 싱크 오프셋 등을 추론합니다.
- **`app.crawler.full_concert_importer`**: 풀 버전 콘서트 영상의 타임라인(댓글 등)을 파싱하여 곡 단위로 쪼개어 DB에 등록합니다.
- **`app.crawler.recheck_worker`**: 데이터가 부족하거나 분석이 실패했던 영상들을 다시 재검토하여 보완합니다.

### 2. Data Maintenance (유지보수 관련)
- **`fix_zero_offsets.py`**: 오프셋이 `0`으로 잘못 설정된 영상들을 찾아 해당 곡의 셋리스트 시작 시간으로 자동 보정합니다.
- **`fix_sequences.py`**: 영상들의 순서나 노래 태그가 꼬인 경우 이를 바로잡습니다.
- **`fix_video_dates.py`**: 콘서트 날짜와 영상의 수집 날짜가 불일치하는 경우를 보정합니다.
- **`normalize_timestamps.py`**: 다양한 형식의 타임스탬프(01:23:45, 83:45 등)를 초 단위 숫자로 표준화합니다.
- **`update_durations_playwright.py`**: Playwright를 이용해 유튜브 영상의 정확한 재생 시간을 다시 가져와 업데이트합니다.

### 3. AI & Sync (분석 및 싱크 관련)
- **`ai_contributor_sync.py`**: 기존 영상들을 다시 훑으며 AI에게 더 정확한 곡 매칭과 싱크 오프셋을 제안받아 `Contribution`으로 등록합니다.
- **`ai_tag_videos.py`**: 노래 태그가 없는 영상들을 AI가 분석하여 자동으로 곡 정보를 태그해 줍니다.
- **`ai_fix_setlist_times.py`**: 셋리스트의 곡 시작 시간이 부정확할 때 AI를 이용해 타임라인을 재구성합니다.
- **`ai_tag_full_concerts.py`**: 풀 버전 콘서트 영상 내에서 특정 곡이 시작되는 구간을 AI가 정밀하게 찾아냅니다.

### 4. Migration (마이그레이션 관련)
- **`migrate_to_supabase.py`**: 로컬 SQLite 데이터를 Supabase(PostgreSQL)로 이전합니다.
- **`migrate_flexible_timeline.py`**: 고정된 셋리스트 구조에서 유연한 타임라인 구조로 DB 스키마를 변경할 때 사용합니다.
- **`migrate_shorts.py`**: 일반 영상과 쇼츠 영상을 구분하는 플래그를 일괄 적용합니다.

