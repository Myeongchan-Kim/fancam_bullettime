#!/usr/bin/env python3
"""
PreToolUse Hook: Enforces Zero-DB Policy on Simulation Execution.

Inspects any run_command CommandLine that runs a simulation/benchmark/eval script.
Statically parses the target Python script's AST.
If any database library (sqlalchemy, psycopg2, sqlite3, app.db, app.models) is imported
or referenced, hard blocks (denies) the execution and reports the violation.
"""

import sys
import json
import re
import os
import ast

BANNED_DB_MODULES = [
    "app.db",
    "app.models",
    "sqlalchemy",
    "psycopg2",
    "sqlite3",
]

def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print(json.dumps({"decision": "allow"}))
        return

    tool_call = payload.get("toolCall", {})
    tool_name = tool_call.get("name", "")
    args = tool_call.get("args", {})
    command_line = args.get("CommandLine", "")

    # Only inspect python commands running simulation or evaluation scripts
    if "python" in command_line and any(kw in command_line for kw in ["simulation", "evaluate", "benchmark"]):
        # Extract script path
        match = re.search(r'(?:python[0-9.]*|python3)\s+([^\s;&|]+\.py)', command_line)
        if match:
            script_path = match.group(1)
            workspace_paths = payload.get("workspacePaths", [])
            resolved_path = None
            if os.path.isabs(script_path) and os.path.exists(script_path):
                resolved_path = script_path
            else:
                for wp in workspace_paths:
                    candidates = [
                        os.path.join(wp, script_path),
                        os.path.join(wp, "backend", script_path)
                    ]
                    for cand in candidates:
                        if os.path.exists(cand):
                            resolved_path = cand
                            break
                    if resolved_path:
                        break

            if resolved_path and os.path.exists(resolved_path):
                try:
                    with open(resolved_path, "r", encoding="utf-8") as f:
                        tree = ast.parse(f.read(), filename=resolved_path)

                    for node in ast.walk(tree):
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                for banned in BANNED_DB_MODULES:
                                    if alias.name == banned or alias.name.startswith(banned + "."):
                                        print(json.dumps({
                                            "decision": "deny",
                                            "reason": f"🚨 [ZERO-DB HOOK BLOCKED] Banned DB import '{alias.name}' detected at line {node.lineno} in {script_path}. Simulation must be 100% decoupled from database libraries!"
                                        }))
                                        return
                        elif isinstance(node, ast.ImportFrom):
                            mod = node.module or ""
                            for banned in BANNED_DB_MODULES:
                                if mod == banned or mod.startswith(banned + "."):
                                    print(json.dumps({
                                        "decision": "deny",
                                        "reason": f"🚨 [ZERO-DB HOOK BLOCKED] Banned DB import 'from {mod} import ...' detected at line {node.lineno} in {script_path}. Simulation must be 100% decoupled from database libraries!"
                                    }))
                                    return
                except Exception:
                    pass

    print(json.dumps({"decision": "allow"}))

if __name__ == "__main__":
    main()
