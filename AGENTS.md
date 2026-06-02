# TWICE World Tour 360° Fancam Archive - Shared Agent Memory

## 🧠 Unified Agent Instruction System

이 프로젝트는 에이전트 규칙의 **단일 원천(Single Source of Truth)**과 자동화를 위해 모든 핵심 수칙 및 가이드를 `.agents/rules/` 디렉토리에 세분화하여 보관하고 있습니다.

### 🔗 Symbolic Links Note
- **`GEMINI.md`** 및 **`CLAUDE.md`**는 본 파일(`AGENTS.md`)을 가리키는 **심볼릭 링크**입니다. 에이전트 진입 지점 설정을 변경해야 할 경우 이 마스터 파일을 수정하세요.

---

## 🛠️ Active Workspace Rules (자동 적용 규칙 목록)

Antigravity 시스템에 의해 작업 상황(파일 확장자, 에이전트 판단 등)에 맞춰 자동으로 백그라운드에 활성화되는 규칙 가이드라인입니다. 자세한 내용은 각 마크다운 파일을 확인하세요.

1. **[database.md](file:///Users/mckim/projects/tmp/twice_concert_crawling/.agents/rules/database.md) (Always On)**
   - `backend/twice_fancam.db` 유실 방지 및 API 레이어를 통한 데이터 무결성 추상화 규칙.
2. **[git_strategy.md](file:///Users/mckim/projects/tmp/twice_concert_crawling/.agents/rules/git_strategy.md) (Always On)**
   - `main` 프로덕션 브랜치 직접 커밋/푸시 방지 및 작업 전용 브랜치/PR 워크플로우 보장.
3. **[python_env.md](file:///Users/mckim/projects/tmp/twice_concert_crawling/.agents/rules/python_env.md) (Glob: `backend/**/*.py`)**
   - 백엔드 코드 수정 시 자동으로 동작하며, 가상환경 활성화(`source .venv/bin/activate`) 및 `uv` 관리 강제.
4. **[crawler.md](file:///Users/mckim/projects/tmp/twice_concert_crawling/.agents/rules/crawler.md) (Model Decision)**
   - 유튜브 크롤러 중복 방지를 위한 스크립트 인벤토리 확인 및 마스터 타임라인 `sync_offset` 보정 방향 정형화.
