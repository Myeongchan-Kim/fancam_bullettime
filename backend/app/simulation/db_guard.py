"""
Simulation Zero-DB Guard & Runtime Import Interceptor.

PURPOSE:
Enforces absolute zero-database policy in simulation code.
Any attempt to import or access database libraries (app.db, sqlalchemy, psycopg2, sqlite3)
inside simulation modules will trigger a hard exception and instantly fail the execution.
"""

import sys
import ast
import inspect

BANNED_DB_MODULES = {
    "app.db",
    "app.models",
    "sqlalchemy",
    "psycopg2",
    "sqlite3",
}

class SimulationDBAccessViolation(RuntimeError):
    """Raised when simulation code attempts to touch the database."""
    pass

class BannedModuleImporter:
    """Import hook that intercepts sys.meta_path to forbid DB libraries in simulation."""
    def find_spec(self, fullname, path, target=None):
        for banned in BANNED_DB_MODULES:
            if fullname == banned or fullname.startswith(banned + "."):
                stack = inspect.stack()
                for frame_info in stack:
                    fname = frame_info.filename.lower()
                    if "simulation" in fname or "evaluate" in fname or "benchmark" in fname:
                        raise SimulationDBAccessViolation(
                            f"🚨 [ZERO-DB POLICY VIOLATION] Simulation code attempted to import database library: '{fullname}'!\n"
                            f"Violating File: {frame_info.filename}:{frame_info.lineno}\n"
                            f"RULE: Simulation MUST be 100% pure in-memory and completely decoupled from the database."
                        )
        return None

def install_runtime_db_guard():
    """Installs the zero-db import hook into Python's sys.meta_path."""
    if not any(isinstance(h, BannedModuleImporter) for h in sys.meta_path):
        sys.meta_path.insert(0, BannedModuleImporter())

def static_check_no_db(file_path: str):
    """
    Performs static AST analysis on a file.
    If any banned DB import or pattern is detected, raises SimulationDBAccessViolation immediately.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        tree = ast.parse(f.read(), filename=file_path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                for banned in BANNED_DB_MODULES:
                    if alias.name == banned or alias.name.startswith(banned + "."):
                        raise SimulationDBAccessViolation(
                            f"🚨 [STATIC AST CHECK FAILED] Found banned database import '{alias.name}' at line {node.lineno} in {file_path}!"
                        )
        elif isinstance(node, ast.ImportFrom):
            mod = node.module or ""
            for banned in BANNED_DB_MODULES:
                if mod == banned or mod.startswith(banned + "."):
                    raise SimulationDBAccessViolation(
                        f"🚨 [STATIC AST CHECK FAILED] Found banned database import 'from {mod} import ...' at line {node.lineno} in {file_path}!"
                    )

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        try:
            static_check_no_db(target)
            print(f"✅ [STATIC DB GUARD] Verified {target}: Zero DB libraries detected.")
        except SimulationDBAccessViolation as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)
