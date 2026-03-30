# Contributing to TWICE World Tour 360° Fancam Archive 🍭

Thank you for your interest in contributing to the TWICE World Tour 360° Fancam Archive! We welcome all ONCEs and developers to help us build the most comprehensive, multi-angle concert archive.

## 🏗️ Architecture Overview

Our application is built on a modern, serverless architecture:
- **Frontend:** React (Vite) + TypeScript + Tailwind CSS (Deployed on **Vercel**)
- **Backend:** FastAPI + Python (Deployed as Serverless Functions on **Vercel**)
- **Database:** PostgreSQL (Hosted on **Supabase** with Transaction Pooling)

## ⚖️ Core Development Rules

### 1. 🛡️ API First (No Direct DB Writes)
**Never modify the database directly** when adding new videos, songs, or tags from external scripts or crawlers. 
- All data ingestion **must** go through the REST API endpoints (e.g., `POST /api/contributions`).
- This abstraction layer is critical for data validation, security, and compatibility with our serverless setup.

### 2. 🚦 Pre-Push Type Checking
We enforce strict TypeScript typing and code linting on the frontend.
Before you push your code, you must ensure it passes our CI checks. 

We use `husky` to automatically run checks before every push. 
To set up your local environment:
```bash
cd frontend
npm install
npm run prepare # Initializes husky hooks
```
*(The hook runs `npm run type-check` and `npm run lint` automatically. If there are any TypeScript errors or lint warnings, the push will be aborted.)*

## 🛠️ Local Development Setup

### Backend (FastAPI)
1. Navigate to the backend directory: `cd backend`
2. Install dependencies using `uv`: `uv sync` (or your preferred python package manager)
3. Set up your `.env` file (copy from `.env.example`). You can use a local SQLite DB (`sqlite:///./twice_fancam.db`) for development or connect to your own Supabase instance.
4. Run the development server: `uv run python -m app.main` (Available at `http://localhost:8000`)

### Frontend (React/Vite)
1. Navigate to the frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Set your `.env` to point to the backend: `VITE_API_BASE_URL=http://localhost:8000/api`
4. Start the dev server: `npm run dev`

## 🤖 Crawlers and Bots
If you are developing or modifying the automated Fancam Crawlers (`step2_recommendation.py` or `ai_contributor_sync.py`), remember that they run as independent clients. They must use the standard Contribution APIs to submit their findings.

## 🚀 Branching and Pull Requests
1. Create a new branch for your feature or bugfix (e.g., `feat/add-new-concert`, `fix/timeline-sync`).
2. Commit your changes with clear, descriptive messages.
3. Push to your branch and open a Pull Request (PR) against the `main` branch.
4. A maintainer will review your code, and once approved, it will be automatically deployed via Vercel.

Let's build this archive together! "ONE IN A MILLION!" ✨
