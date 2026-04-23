#!/usr/bin/env python3
"""
Enforce the barter-cars money-isolation rule.

The `barter_cars` app must NOT import from finance/budgeting/actuals/expenses,
and those modules must NOT import from `barter_cars`. See
.claude/skills/barter-money-isolation/SKILL.md for the rationale.

Exits 0 if clean, 1 if violations are found.
Run from repo root or from `backend/` — the script locates `backend/apps/`.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

BARTER_APP = "barter_cars"
FORBIDDEN_FROM_BARTER = {
    "apps.finance",
    "apps.budgeting",
    "apps.actuals",
    "apps.expenses",
    "apps.planning",
    "apps.plans",
}
FORBIDDEN_FROM_FINANCE_SIDE = {f"apps.{BARTER_APP}"}
FINANCE_SIDE_APPS = {
    "finance",
    "budgeting",
    "actuals",
    "expenses",
    "planning",
    "plans",
}


def find_apps_dir() -> Path | None:
    here = Path(__file__).resolve().parent
    for candidate in (here.parent / "backend" / "apps", here.parent.parent / "backend" / "apps"):
        if candidate.is_dir():
            return candidate
    return None


def iter_imports(py_file: Path):
    try:
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    except SyntaxError:
        return
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            yield node.lineno, node.module
        elif isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, alias.name


def module_matches(imported: str, forbidden: set[str]) -> bool:
    return any(imported == f or imported.startswith(f + ".") for f in forbidden)


def scan_app(app_dir: Path, forbidden: set[str]) -> list[tuple[Path, int, str]]:
    violations: list[tuple[Path, int, str]] = []
    for py_file in app_dir.rglob("*.py"):
        if "migrations" in py_file.parts:
            continue
        for lineno, imported in iter_imports(py_file):
            if module_matches(imported, forbidden):
                violations.append((py_file, lineno, imported))
    return violations


def main() -> int:
    apps_dir = find_apps_dir()
    if apps_dir is None:
        print("ERROR: could not locate backend/apps/", file=sys.stderr)
        return 2

    barter_dir = apps_dir / BARTER_APP
    all_violations: list[tuple[str, Path, int, str]] = []

    if barter_dir.is_dir():
        for path, lineno, imported in scan_app(barter_dir, FORBIDDEN_FROM_BARTER):
            all_violations.append((f"{BARTER_APP} imports finance-side", path, lineno, imported))

    for finance_app in FINANCE_SIDE_APPS:
        finance_dir = apps_dir / finance_app
        if not finance_dir.is_dir():
            continue
        for path, lineno, imported in scan_app(finance_dir, FORBIDDEN_FROM_FINANCE_SIDE):
            all_violations.append((f"{finance_app} imports barter_cars", path, lineno, imported))

    if not all_violations:
        print("barter-cars isolation: OK")
        return 0

    print("barter-cars isolation: VIOLATIONS FOUND", file=sys.stderr)
    for direction, path, lineno, imported in all_violations:
        rel = path.relative_to(apps_dir.parent.parent) if path.is_absolute() else path
        print(f"  [{direction}] {rel}:{lineno}  imports `{imported}`", file=sys.stderr)
    print(
        "\nSee .claude/skills/barter-money-isolation/SKILL.md for the rule.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
