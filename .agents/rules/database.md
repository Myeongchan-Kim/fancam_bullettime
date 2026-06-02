# Database Integrity and Safety Rules

---
name: database_integrity
title: Database Integrity and Safety Rules
activation: Always On
---

## 🛠️ Core Database Rules

### 1. SQLite Local DB Protection (CRITICAL)
- **NEVER DELETE `backend/twice_fancam.db`**.
- It contains live gathered fancam and sync metadata.
- Before executing any raw files, database migrations, or server script operations, always verify that the database file exists and its size is greater than 0 bytes.

### 2. Mandatory API Abstraction
- **NEVER modify the Supabase or local SQLite database directly via SQL or direct SQLAlchemy sessions for contributing or updating fancam sync metadata.**
- All user or agent contributions must be routed through the dedicated REST API endpoints (e.g., `POST /api/contributions`).
- This abstraction ensures proper payload validation, strict model consistency, and reliable compatibility with the hybrid deployment architecture (Vercel serverless functions + Supabase PostgreSQL).

### 3. Data Model & ORM Types
- **Song Model Constraints:** `Song.is_solo` must be defined as a strict `bool` (non-nullable).
- **JSON Field Type Definition:** Structured JSON list/dictionary columns (e.g., `members` in Video, `suggested_song_ids` in Song) must use the custom `JSONEncodedList` ORM type.
- **SQLite JSON Failsafe:** SQLite stores JSON as strings, which can cause unexpected nested double-serialization or raw string payloads. You must always use the `ensure_list` utility function in the API and utility layers to gracefully parse double-serialized JSON outputs.
