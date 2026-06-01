# Python Virtual Environment and `uv` Rules

---
name: python_env_management
title: Python Virtual Environment and uv Rules
activation: Glob
glob: backend/**/*.py
---

## 🐍 Python Execution and Dependency Management

### 1. Mandatory use of `uv` Package Manager
- **Always use `uv`** for all Python-related backend operations, virtual environment management, package installation, and script execution.
- Do not run bare `pip` or standard `python` commands unless specifically requested. Use `uv run python -m ...` instead.

### 2. Environment Activation Prefix
- When executing any Python command or running a standalone script inside the `backend` or related directories, always prefix the command to ensure the correct virtual environment is fully initialized.
- **Prefix format:** `source .venv/bin/activate && ...`
- Example: `source .venv/bin/activate && uv run python -m app.main`
- This ensures Python paths, package resolutions, and environment variables are strictly bounded inside the local `.venv`.

### 3. Dependency Updates
- If you install or update a dependency using `uv pip install ...` or `uv add`, make sure to keep the dependencies documented in `pyproject.toml` or `requirements.txt` to keep the production server reproducible.
