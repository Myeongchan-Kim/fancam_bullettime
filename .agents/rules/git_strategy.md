# Strict Git Branch Strategy

---
name: git_branch_strategy
title: Strict Git Branch Strategy
activation: Always On
---

## 🚀 Branch and Merging Principles

### 1. Main Branch Protection
- `main` is the **Live Production Deployment Branch** connected directly to the Vercel hosting server.
- **ABSOLUTELY NO DIRECT COMMITS OR DIRECT PUSHES TO `main` ARE ALLOWED.**
- Under any circumstances, do not try to run commits directly on the `main` branch or merge files locally without review.

### 2. Feature Branching Workflow
- When starting any fix, feature development, or documentation update, you must always:
  1. Identify or create a new dedicated branch prefixed with the task type:
     - `feat/...` for new features or crawler additions.
     - `fix/...` for bugs, database synchronization, or timeline fixes.
     - `docs/...` for updating markdown documents.
  2. Perform code modifications on that dedicated feature branch.
  3. Commit and push the branch to remote.
  4. Create a Pull Request (PR) for review.

### 3. Mandatory PR Review & Merge Protocols
- **모든 PR은 병합(Merge) 전에 사용자 리뷰 및 승인이 필수입니다.**
- PR 생성 시 다음 항목을 명확히 요약하여 사용자에게 리뷰를 요청합니다:
  1. **작업 요약 (Summary of Changes)**: 어떤 기능/버그를 수정했는지
  2. **핵심 변경점 (Key Code Diffs)**: 프론트엔드/백엔드/DB 모델 등 핵심 로직 변화
  3. **검증 결과 (Verification)**: `pytest`, `npm run build` 등 사전 테스트 통과 내역
  4. **잠재적 위험 및 사이드이펙트 (Risk Analysis)**
- **절대 사용자의 명시적인 검토 및 승인(Explicit User Approval) 없이 PR을 임의로 자동 머지하지 않습니다.**
