# TWICE World Tour 360° Fancam Archive 🍭

TWICE 직캠 모음 웹 서비스입니다. 유튜브에 산재해 있는 멤버들의 아름다운 무대 직캠을 한 곳에서 쉽게 찾아보고 감상할 수 있습니다. 특히 최신 월드 투어의 도시별, 곡별 직캠을 체계적으로 분류하여 제공합니다.

## Features ✨
- **콘서트/투어별 필터링:** 'THIS IS FOR' 투어 등 각 도시별, 날짜별 무대 감상
- **멤버 및 곡별 필터링:** 그룹 곡부터 개인 솔로 무대까지 세분화된 분류
- **자동 업데이트:** 주기적으로 유튜브에서 새로운 직캠 영상을 수집하여 반영

## Tech Stack 🛠️
- **Frontend:** React (Vite), Tailwind CSS
- **Backend:** FastAPI (Python), SQLAlchemy
- **Database:** PostgreSQL
- **Deployment:** Vercel (Frontend), Railway / Render (Backend)

## Getting Started 🚀

### 1. Backend Setup
\`\`\`bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

### 2. Frontend Setup
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

## Contributing 🤝
버그 리포트, 기능 제안, PR 모두 환영합니다!
