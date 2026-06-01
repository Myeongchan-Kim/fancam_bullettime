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

### 3. Merge Protocols
- Merging your feature branch into `main` requires:
  - **Explicit User Approval** in the chat interface.
  - Verification of passing status for local pre-push hooks or CI/CD pipelines (if configured).
