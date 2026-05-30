# Database Backup Strategy & Recovery Plan

## 🚨 The Problem
The primary database (`twice_fancam.db`) is a local SQLite file. It was removed from Git tracking on March 26 to save space and prevent merge conflicts. Consequently, any data modifications (like manually setting sync offsets) made after this date were lost when local changes were overwritten or not backed up.

## 🛡️ Backup Strategy (To-Be Implemented)

### 1. Automated Local Snapshots (Pre-flight Backups)
- **Action:** Modify the backend start script or crawler execution scripts to automatically create a timestamped copy of `twice_fancam.db` into a `backend/backups/` directory before executing any major write operations (e.g., `ai_contributor_sync.py`, `update_master_setlist.py`).
- **Retention:** Keep the last 10 backups and automatically delete older ones to save space.

### 2. Cloud Storage Sync (Cron Job)
- **Action:** Set up a lightweight cron job or GitHub Action that securely uploads the SQLite file to a private cloud bucket (e.g., AWS S3, Google Cloud Storage, or Supabase Storage) every night.
- **Benefit:** Protects against local machine failure or accidental deletion.

### 3. Git-Tracked Seed Data (Optional)
- **Action:** Export crucial mapping data (like `Concert`, `Song`, and `ConcertSetlist` definitions) into static JSON or CSV files that *are* tracked by Git. This ensures the structural skeleton of the project is always version-controlled, even if the heavy `Video` records are not.

---

## 🛠️ Recovery Plan for Lost Offsets (Current Action)
1. **Target Identification:** Identify videos belonging to specific concerts (e.g., `2025-07-19` Incheon).
2. **Tagging:** Run `ai_tag_videos.py` or a targeted script to ensure all videos have their respective `Song` tags.
3. **Zero-Offset Fix:** Run a modified `fix_zero_offsets.py` to populate missing offsets using the master setlist start times.
4. **AI Refinement:** Run `ai_contributor_sync.py` to precisely refine the offsets based on YouTube audio/timeline analysis via Gemini.
