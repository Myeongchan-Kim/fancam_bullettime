# Database Backup Strategy & Recovery Plan

## 🚨 The Problem
The primary database (`twice_fancam.db`) is a local SQLite file. It was removed from Git tracking on March 26 to save space and prevent merge conflicts. Consequently, any data modifications (like manually setting sync offsets) made after this date were lost when local changes were overwritten or not backed up.
**Status Update (2026-05-31):** The project now primarily uses Supabase (PostgreSQL). Local SQLite exists but is not the primary source of truth.

## 🛡️ Backup Strategy (To-Be Implemented)

### 1. Automated Local Snapshots (Pre-flight Backups)
- **Action:** Modify the backend start script or crawler execution scripts to automatically create a timestamped copy of `twice_fancam.db` into a `backend/backups/` directory before executing any major write operations (e.g., `ai_contributor_sync.py`, `update_master_setlist.py`).
- **Retention:** Keep the last 10 backups and automatically delete older ones to save space.
- **Done:** Manual initial backup created in `backend/backups/`.

### 2. Cloud Storage Sync (Cron Job)
- **Action:** Set up a lightweight cron job or GitHub Action that securely uploads the SQLite file to a private cloud bucket (e.g., AWS S3, Google Cloud Storage, or Supabase Storage) every night.
- **Benefit:** Protects against local machine failure or accidental deletion.

### 3. Git-Tracked Seed Data (Optional)
- **Action:** Export crucial mapping data (like `Concert`, `Song`, and `ConcertSetlist` definitions) into static JSON or CSV files that *are* tracked by Git. This ensures the structural skeleton of the project is always version-controlled, even if the heavy `Video` records are not.

---

## 🛠️ Recovery Plan for Lost Offsets (Current Action)
1. **Target Identification:** Identify videos belonging to specific concerts (e.g., `2025-07-19` Incheon). 
   - **Progress:** 1118 untagged videos identified in Supabase.
2. **Tagging:** Run `ai_tag_videos.py` or a targeted script to ensure all videos have their respective `Song` tags.
   - **Progress:** **DONE**. Tagged 931 videos using `backend/tag_videos_local.py`.
3. **Setlist Standardization:** Ensure all songs are correctly named and ordered.
   - **Progress:** **DONE**. Fixed `update_master_setlist.py` (foreign key bug) and successfully migrated the `Song` table.
4. **Incomplete Setlist Fix (NEW):** Many concerts have incomplete `ConcertSetlist` entries, causing `fix_zero_offsets.py` to skip them.
   - **Task:** Populate missing setlist items for major concerts using the master timeline as a template.
5. **Zero-Offset Fix:** Run a modified `fix_zero_offsets.py` to populate missing offsets using the master setlist start times.
   - **Progress:** **STARTED**. 30 videos fixed. Need more complete setlists to fix the remaining ~475.
6. **AI Refinement:** Run `ai_contributor_sync.py` to precisely refine the offsets based on YouTube audio/timeline analysis via Gemini.

