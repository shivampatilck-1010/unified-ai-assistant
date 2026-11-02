import asyncio
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("services.coding_agent")


class WorkspaceFile(BaseModel):
    path: str
    relative_path: str
    size_bytes: int
    is_directory: bool


class CodeModificationResult(BaseModel):
    file_path: str
    status: str  # modified | created | error
    lines_added: int = 0
    lines_removed: int = 0
    diff_summary: str = ""
    error: Optional[str] = None


class TestExecutionResult(BaseModel):
    passed: bool
    exit_code: int
    tests_run: int = 0
    tests_failed: int = 0
    duration_seconds: float = 0.0
    stdout: str = ""
    stderr: str = ""


class CodingAgent:
    """Autonomous software engineering agent for inspecting, modifying, testing, and verifying code."""

    def __init__(self, default_workspace: Optional[str] = None):
        self.default_workspace = Path(default_workspace or Path(__file__).resolve().parent.parent.parent).resolve()

    def _validate_path(self, target: Path) -> Path:
        resolved = target.resolve()
        try:
            resolved.relative_to(self.default_workspace)
        except ValueError:
            raise PermissionError(f"Access denied: path '{target}' is outside authorized workspace root '{self.default_workspace}'")
        return resolved

    def inspect_workspace(self, workspace_path: Optional[str] = None, max_files: int = 100) -> List[WorkspaceFile]:
        """Inspects authorized workspace directory and lists codebase structure."""
        root = Path(workspace_path).resolve() if workspace_path else self.default_workspace
        root = self._validate_path(root)
        files: List[WorkspaceFile] = []
        ignored_dirs = {".git", "node_modules", ".venv", "venv", "__pycache__", ".pytest_cache", "dist", "build"}

        for p in root.rglob("*"):
            if any(part in ignored_dirs for part in p.parts):
                continue
            rel = str(p.relative_to(root))
            is_dir = p.is_dir()
            size = p.stat().st_size if not is_dir and p.exists() else 0
            files.append(WorkspaceFile(
                path=str(p),
                relative_path=rel,
                size_bytes=size,
                is_directory=is_dir,
            ))
            if len(files) >= max_files:
                break

        return files

    def read_source_file(self, file_path: str, max_lines: int = 500) -> str:
        """Reads code content from authorized workspace path."""
        p = Path(file_path)
        if not p.is_absolute():
            p = self.default_workspace / p
        p = self._validate_path(p)
        if not p.exists() or p.is_dir():
            raise FileNotFoundError(f"Source file not found: {file_path}")

        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[:max_lines])

    def apply_modification(self, file_path: str, new_content: str) -> CodeModificationResult:
        """Safely creates or replaces file contents in the authorized workspace."""
        p = Path(file_path)
        if not p.is_absolute():
            p = self.default_workspace / p
        p = self._validate_path(p)

        p.parent.mkdir(parents=True, exist_ok=True)
        old_lines = p.read_text(encoding="utf-8", errors="replace").splitlines() if p.exists() else []
        new_lines = new_content.splitlines()

        p.write_text(new_content, encoding="utf-8")
        lines_added = max(0, len(new_lines) - len(old_lines))
        lines_removed = max(0, len(old_lines) - len(new_lines))

        return CodeModificationResult(
            file_path=str(p),
            status="modified" if old_lines else "created",
            lines_added=lines_added,
            lines_removed=lines_removed,
            diff_summary=f"+{lines_added} / -{lines_removed} lines",
        )

    async def run_tests(
        self,
        workspace_path: Optional[str] = None,
        test_command: Optional[str] = None,
        timeout_seconds: int = 30,
    ) -> TestExecutionResult:
        """Executes automated test suites within the workspace in an isolated subprocess."""
        root = Path(workspace_path).resolve() if workspace_path else self.default_workspace
        root = self._validate_path(root)
        cmd = test_command or f'"{sys.executable}" -m pytest -q --tb=short'

        start_time = asyncio.get_event_loop().time()
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=str(root),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
            duration = round(asyncio.get_event_loop().time() - start_time, 2)
            out_str = stdout.decode("utf-8", errors="replace")
            err_str = stderr.decode("utf-8", errors="replace")

            passed = proc.returncode == 0
            tests_run = out_str.count("passed") + out_str.count("failed")
            tests_failed = out_str.count("failed")

            return TestExecutionResult(
                passed=passed,
                exit_code=proc.returncode,
                tests_run=max(tests_run, 1 if passed else 0),
                tests_failed=tests_failed,
                duration_seconds=duration,
                stdout=out_str[:1500],
                stderr=err_str[:1000],
            )
        except asyncio.TimeoutError:
            return TestExecutionResult(
                passed=False,
                exit_code=-1,
                stdout="",
                stderr=f"Test execution timed out after {timeout_seconds} seconds.",
            )
        except Exception as ex:
            return TestExecutionResult(
                passed=False,
                exit_code=1,
                stdout="",
                stderr=f"Test runner error: {str(ex)}",
            )
