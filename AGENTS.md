# TWICE World Tour Archive - Shared Agent Memory (GEMINI.md -> AGENTS.md)

## Current Status (2026-03-17)
The project has reached a functional prototype stage. Fancams are being collected via an AI-powered crawler and displayed on a modern React web interface with multi-angle and wiki features.

### Project Architecture
- **Backend:** FastAPI (Python) using `uv`.
  - Database: SQLite (`twice_fancam.db`) with `Video`, `Song`, `Concert`, `AngleSuggestion` tables.
  - API endpoints for video listing, filtering, and wiki-style suggestions are fully implemented.
- **Frontend:** React (Vite) + TypeScript + Tailwind CSS v4.
  - **Vite 5** is used for compatibility with Node 21.7.2.
  - **Tailwind 4** is configured using `@tailwindcss/vite` plugin and `@import "tailwindcss"` in `index.css`.
  - `package.json` includes `"type": "module"` to support ESM imports in the config.
  - `HomePage`: Features an interactive 360° Stage Map as a central hero element for angle-based filtering.
  - `VideoDetailPage`: Implements YouTube embed, Multi-Angle switcher (related videos), and a visual Stage Map display.
- **Crawler:** AI-based 2-step pipeline (`backend/app/crawler/`).
  - Successfully scraped and labeled initial data from Incheon, Oakland, LA, and Paris.
  - AI Parser (Gemini) effectively filters out non-relevant videos.
  - Step 1 (Search) is verified; Step 2 (Recommendation) requires stable browser session and selector validation.

### Key Mandates
- **CRITICAL: NEVER DELETE `backend/twice_fancam.db`**. The database now contains valuable collected data that must be preserved.
- **Always use `uv`** for Python operations.
- **Memory Sharing:** soft-linked (AGENTS.md -> GEMINI.md -> CLAUDE.md).
- **Execution:**
  - Backend: `cd backend && uv run python -m app.main`
  - Frontend: `cd frontend && npm run dev`

### Progress & Next Steps
- [x] Phase 0: Data collection (Tour Schedule & Setlist)
- [x] Phase 1: Repo & Arch initialization
- [x] Phase 2: AI Crawler & Parser implementation
- [x] Phase 3: Backend API & DB integration
- [x] Phase 4: Frontend UI & Multi-Angle Player (v4 Styles fixed)
- [ ] **NEXT STEP:** Automate Step 2 Crawler (Recommendation Feed) via GitHub Actions or a local cron job.
- [ ] **NEXT STEP:** Final deployment strategy (Vercel/Railway).

### Verification
- [x] Verified `step1_search.py` with DB insertion.
- [x] Verified API endpoints manually (Video detail, List filtering).
- [x] Verified `npm run dev` starts successfully with Tailwind v4 styles.
