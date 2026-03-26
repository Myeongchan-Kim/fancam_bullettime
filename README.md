# TWICE World Tour 360° Fancam Archive 🍭

TWICE 직캠 모음 웹 서비스입니다. 유튜브에 산재해 있는 멤버들의 아름다운 무대 직캠을 한 곳에서 쉽게 찾아보고 감상할 수 있습니다. AI를 활용해 월드 투어의 방대한 데이터를 자동으로 수집하고 체계적으로 분류합니다.

## Key Features ✨
- **콘서트별 동적 타임라인:** 공연별 실제 셋리스트 순서에 맞춘 정밀한 영상 필터링
- **AI 기반 자동 수집:** Gemini AI와 Playwright를 결합한 스마트 크롤링 파이프라인
- **인터랙티브 스테이지 맵:** 360도 아레나 뷰를 통한 멤버별/위치별 영상 탐색
- **멀티 앵글 동기화:** 마스터 타임라인 기준 절대 시간 동기화 (예정)

## Tech Stack 🛠️
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide React
- **Backend:** FastAPI, SQLAlchemy (SQLite), Pydantic v2
- **Intelligence:** Gemini 2.0 Flash AI (Parsing & Extraction)
- **Crawler:** Playwright (Chromium), Asyncio

## Getting Started 🚀

### 1. Backend Setup
```bash
cd backend
# UV 패키지 매니저 사용 권장
uv run python -m app.main
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Crawler Execution
```bash
cd backend
# Step 1: 기본 검색 수집
uv run python -m app.crawler.step1_search
# Step 2: 알고리즘 연쇄 탐색
uv run python -m app.crawler.step2_recommendation
# Importer: 풀 콘서트 셋리스트 추출
uv run python -m app.crawler.full_concert_importer
```

## Architecture 🏗️
상세한 시스템 설계와 데이터 모델은 [ARCHITECTURE.md](./ARCHITECTURE.md) 파일을 참조해 주세요.

## Contributing 🤝
버그 리포트, 기능 제안, PR 모두 환영합니다!
