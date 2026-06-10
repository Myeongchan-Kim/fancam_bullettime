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

### 4. Golden Rule: Infrastructure Stability (CRITICAL)
- **인프라 연결의 보수성 유지 (Infrastructure Conservatism):** `DATABASE_URL` 등 인프라 연결 문자열을 코드 내에서 문자열 조작으로 수정하거나, 사용하는 언어/드라이버(`psycopg2` 등)와 호환되지 않는 타 플랫폼용 파라미터(Prisma 전용 등)를 강제로 주입하지 않는다.
- **[절대 금지]** 파이썬 `psycopg2`와 Supabase 풀러 간의 SSL 호환성 문제로 인해, 코드 내에서 **포트를 6543(Transaction Mode)으로 강제 전환하는 로직을 절대 시도하지 않는다.** 모든 포트 및 연결 설정은 환경 변수에 정의된 값을 100% 신뢰하고 그대로 사용한다.
- **IPv6 및 플랫폼 연결 최적화:** Vercel-Supabase 간의 IPv6 연결 문제와 같은 플랫폼 특성 이슈는 **코드 수정이 아닌 환경 변수(Environment Variables) 설정 최적화**를 통해 해결하는 것을 최우선 원칙으로 한다.

