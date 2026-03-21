# TWICE World Tour 360° Fancam Archive - Shared Agent Memory

## 🛠️ Core Principles & Mandates
- **CRITICAL: NEVER DELETE `backend/twice_fancam.db`**. Contains live gathered data.
- **Branch Strategy:** ALWAYS create a new branch (e.g., `feat/`, `fix/`) for any code changes. NEVER work directly on the `main` branch.
- **Merge Protocol:** Merging to `main` and deleting feature branches MUST require explicit user approval. NEVER automate `git merge` or branch deletion in a single execution flow.
- **Always use `uv`** for all Python/Backend operations.
- **Memory Sharing:** This file is soft-linked (`AGENTS.md -> GEMINI.md -> CLAUDE.md`).
- **Data Integrity:** Any metadata changes must go through the `Contribution` (wiki) system and require Admin approval.

## 🏗️ High-Level Architecture
- **Backend:** FastAPI (Python) + SQLite.
- **Frontend:** React + TypeScript + Tailwind CSS v4.
- **Crawler:** 2-Step AI Pipeline (Playwright + Gemini AI).
- **Mapping:** Precise X/Y coordinate system on a 360° Arena Dial.

*See `ARCHITECTURE.md` for full technical details.*

## 🚀 Execution Commands
- **Start Backend:** `cd backend && uv run python -m app.main`
- **Start Frontend:** `cd frontend && npm run dev`
- **Run Crawler (Step 1):** `cd backend && uv run app/crawler/step1_search.py`

