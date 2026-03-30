# TWICE World Tour 360° Fancam Archive - Shared Agent Memory

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
