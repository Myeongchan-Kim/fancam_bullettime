# System Architecture: TWICE World Tour 360° Fancam Archive

## Overview
This document provides a detailed technical breakdown of the project components, their internal logic, and the layered architecture.

## 1. Directory Structure & Layers
The project follows a standard decoupled frontend/backend architecture:
- `backend/app/`: Core application logic
  - `api/`: FastAPI route handlers (currently in `main.py`).
  - `models/`: SQLAlchemy ORM definitions (`models.py`).
  - `schemas/`: Pydantic models for request/response validation (`schemas.py`).
  - `crawler/`: AI-powered data collection pipeline.
  - `data/`: Ground truth JSON files for tour schedules.
- `frontend/src/`: React application
  - `components/`: Reusable UI elements (Map, Slider, Modals).
  - `pages/`: Main view components (Home, Video Detail).
  - `types/`: Shared TypeScript interfaces.

## 2. Database Design (SQLite)
- **Engine:** SQLite with WAL mode enabled for concurrent crawler/web access.
- **ORM Handling:** Custom `JSONEncodedList` TypeDecorator handles automatic serialization between Python lists/dicts and SQLite strings.
- **Master Tables:**
  - `Video`: Master store for video metadata, members (JSON), and stage coordinates.
  - `Song`: Global catalog of songs. Includes `is_solo` flag and `member_name`.
  - `Concert`: Tour stops with date, city, and venue.
  - `ConcertSetlist`: **New** - Defines the *actual* sequence of songs for a specific concert. Enables concert-specific timeline navigation.
- **Relationship Tables:**
  - `video_song_association`: Many-to-many link between videos and the songs they contain.
- **Wiki System:**
  - `Contribution`: Buffer for user/AI submissions. Automatically applied to `Video` upon admin approval.

## 3. Key Backend Logic
- **Iterative JSON Parser:** `main.py` uses an iterative `ensure_list` failsafe to handle multi-encoded JSON strings from legacy data or SQLite limitations, ensuring Pydantic validation always succeeds.
- **Dynamic Timeline Filtering:** 
  - If a `concert_id` is provided, the API filters videos based on the `display_order` in `ConcertSetlist`.
  - If no concert or setlist is found, it falls back to the global `Song.order`.
- **Admin Security:** Simple header-based validation (`X-Admin-Key`) using a secret defined in `.env`.

## 4. AI Crawler Pipeline
- **Methodology:** 3-step autonomous pipeline using Playwright and Gemini 2.0 Flash.
- **Step 1 (Search):** Targeted keyword search based on tour schedule ground truth.
- **Step 2 (Chain/Async):** **New** - Asynchronous "Recommendation Chain" that starts from a high-quality full concert video and crawls YouTube's sidebar recommendations to discover hidden gems.
- **Full Concert Importer:** Automates the extraction of master timelines from "Full Concert" video descriptions using AI, populating `ConcertSetlist` automatically.
- **AI Parser:** `ai_parser.py` provides async/sync wrappers for Gemini, converting messy YouTube titles and descriptions into clean, structured JSON metadata.

## 5. Frontend UI Components
- **Stack:** React 19 + TypeScript + Tailwind CSS v4.
- **Dynamic Setlist Slider:** Adjusts its range and song names based on whether a specific concert (with a setlist) or a global view is selected. Includes "clamping" safety to prevent UI breakage from out-of-bounds URL params.
- **Interactive Stage Map:** Maps (X, Y) coordinates to a 360° arena layout. Videos are pinned on the map for spatial discovery.
