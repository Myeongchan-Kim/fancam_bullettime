# System Architecture: TWICE World Tour 360° Fancam Archive

## Overview
This document provides a detailed technical breakdown of the project components and their internal logic.

## 1. Backend & Database
- **Framework:** FastAPI (Python)
- **Dependency Management:** `uv`
- **Database:** SQLite (`backend/twice_fancam.db`)
- **Models:**
  - `Video`: The main store of confirmed metadata (URL, coordinates, song, members, etc.).
  - `Song` & `Concert`: Base tables for tour schedule and setlist.
  - `Contribution`: A buffer table for user-submitted edits (wiki style) before admin approval.
- **Key Logic:** 
  - `coordinate_x/y`: Stored as floats (0.0 - 1.0) representing relative position on the square stage map.
  - `members`: Stored as a JSON array to support multiple tags per video.

## 2. Frontend (Web UI)
- **Stack:** React 19 + Vite 5 + TypeScript + Tailwind CSS v4.
- **Tailwind Config:** v4 uses `@tailwindcss/vite` plugin. Custom theme colors (`twice-apricot`, `twice-magenta`) are defined as CSS variables in `index.css`.
- **Interactive Map:**
  - **HomePage:** A 360° dial map using an `aspect-square` layout for precise coordinate mapping. Click-toggle tooltips show thumbnails and allow instant playback via `VideoPlayerModal`.
  - **VideoDetailPage:** Includes an editor/contribution form and an interactive map to pin coordinates.
- **Admin Mode:** 
  - Controlled by `localStorage.getItem('admin_key')`.
  - Validated by the `X-Admin-Key` header on protected API requests.

## 3. Crawler Pipeline
- **Methodology:** A 2-step AI-powered process.
- **Tools:** Playwright (for YouTube interaction), `yt-dlp` (metadata), Gemini AI (parsing).
- **Step 1 (Search):** Iterates through tour cities and setlist to find and label videos. Trains the YouTube algorithm for the specific crawler account.
- **Step 2 (Recommendation):** Discovers high-quality non-standard titled videos from the trained recommendation feed.
- **AI Parser:** `backend/app/crawler/ai_parser.py` uses Gemini to convert messy YouTube titles into structured JSON matching our DB schema.

## 4. Administrative Workflow
- Admins can log in using the passcode defined in `ADMIN_SECRET_KEY` (.env).
- User suggestions are reviewed on the video detail page. Admins can preview suggested positions on the map (bounce animation) and approve to update the master record.
