# TWICE World Tour 360° Fancam Archive - Shared Agent Memory

## 🛠️ Core Principles & Mandates
- **CRITICAL: NEVER DELETE `backend/twice_fancam.db`**. Contains live gathered data. Always verify file size > 0 before operations.
- **Branch Strategy:** ALWAYS create a new branch (e.g., `feat/`, `fix/`) for any code changes. NEVER work directly on the `main` branch.
- **Merge Protocol:** Merging to `main` requires explicit user approval.
- **Always use `uv`** for all Python/Backend operations.
- **Data Integrity:** 
  - `Song.is_solo` must be `bool` (non-nullable).
  - JSON fields (`members`, `suggested_song_ids`) must use `JSONEncodedList` ORM type.
  - Always use `ensure_list` failsafe in API layers to handle SQLite JSON quirks.

## 🏗️ High-Level Architecture
- **Backend:** FastAPI + SQLAlchemy (SQLite).
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
