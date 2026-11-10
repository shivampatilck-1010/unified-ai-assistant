import asyncio
import difflib
import hashlib
import logging
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

logger = logging.getLogger("services.coding_agent")
MAX_EDIT_BYTES = 1_000_000
MAX_TEST_OUTPUT_BYTES = 256_000


async def _read_bounded_output(stream: asyncio.StreamReader) -> bytes:
    output = bytearray()
    truncated = False
    while True:
        chunk = await stream.read(64 * 1024)
        if not chunk:
            break
        remaining = MAX_TEST_OUTPUT_BYTES - len(output)
        if remaining > 0:
            output.extend(chunk[:remaining])
        if len(chunk) > remaining:
            truncated = True
    if truncated:
        output.extend(b"\n[output truncated]")
    return bytes(output)


class WorkspaceFile(BaseModel):
    path: str
    relative_path: str
    size_bytes: int
    is_directory: bool


class CodeModificationPreview(BaseModel):
    file_path: str
    status: str
    original_sha256: Optional[str] = None
    diff: str
    lines_added: int
    lines_removed: int


class CodeModificationResult(BaseModel):
    file_path: str
    status: str
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
    """Workspace-scoped coding tools with reviewable, conflict-checked edits."""

    def __init__(self, default_workspace: Optional[str] = None):
        self.default_workspace = Path(
            default_workspace or Path(__file__).resolve().parents[3]
        ).resolve()
        if default_workspace:
            self.default_workspace.mkdir(parents=True, exist_ok=True, mode=0o700)
            if os.name != "nt":
                self.default_workspace.chmod(0o700)

    @classmethod
    def for_user(cls, user_id: str, workspace_root: str) -> "CodingAgent":
        user_key = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
        workspace = Path(workspace_root).resolve() / user_key
        return cls(default_workspace=str(workspace))

    def _validate_path(self, target: Path) -> Path:
        resolved = target.resolve()
        try:
            resolved.relative_to(self.default_workspace)
        except ValueError as exc:
            raise PermissionError(
                f"Access denied: path '{target}' is outside the authorized workspace."
            ) from exc
        return resolved

    def _resolve_file(self, file_path: str) -> Path:
        target = Path(file_path)
        if not target.is_absolute():
            target = self.default_workspace / target
        return self._validate_path(target)

    def inspect_workspace(self, workspace_path: Optional[str] = None, max_files: int = 100) -> List[WorkspaceFile]:
        root = self._validate_path(Path(workspace_path) if workspace_path else self.default_workspace)
        if not root.is_dir():
            raise FileNotFoundError(f"Workspace directory not found: {root}")

        files: List[WorkspaceFile] = []
        ignored_dirs = {
            ".git", ".venv", "venv", "__pycache__", ".pytest_cache",
            "node_modules", "dist", "build", ".cortex-checkpoints",
        }
        for path in root.rglob("*"):
            relative = path.relative_to(root)
            if any(part in ignored_dirs for part in relative.parts):
                continue
            is_directory = path.is_dir()
            files.append(
                WorkspaceFile(
                    path=relative.as_posix(),
                    relative_path=relative.as_posix(),
                    size_bytes=path.stat().st_size if not is_directory else 0,
                    is_directory=is_directory,
                )
            )
            if len(files) >= max_files:
                break
        return files

    def read_source_file(self, file_path: str, max_lines: int = 500) -> str:
        path = self._resolve_file(file_path)
        if not path.exists() or path.is_dir():
            raise FileNotFoundError(f"Source file not found: {file_path}")
        if path.stat().st_size > MAX_EDIT_BYTES:
            raise ValueError(f"Files larger than {MAX_EDIT_BYTES} bytes cannot be read in the editor.")
        return "".join(path.read_text(encoding="utf-8").splitlines(keepends=True)[:max_lines])

    def preview_modification(self, file_path: str, new_content: str) -> CodeModificationPreview:
        if len(new_content.encode("utf-8")) > MAX_EDIT_BYTES:
            raise ValueError(f"Edits cannot exceed {MAX_EDIT_BYTES} bytes.")
        path = self._resolve_file(file_path)
        if path.exists() and path.is_dir():
            raise IsADirectoryError(f"Cannot modify a directory: {file_path}")
        if path.exists() and path.stat().st_size > MAX_EDIT_BYTES:
            raise ValueError(f"Files larger than {MAX_EDIT_BYTES} bytes cannot be edited.")

        original_bytes = path.read_bytes() if path.exists() else None
        try:
            original_content = original_bytes.decode("utf-8") if original_bytes is not None else ""
        except UnicodeDecodeError as exc:
            raise ValueError("Only UTF-8 text files can be edited.") from exc
        old_lines = original_content.splitlines(keepends=True)
        new_lines = new_content.splitlines(keepends=True)
        diff_lines = list(
            difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/{path.relative_to(self.default_workspace).as_posix()}",
                tofile=f"b/{path.relative_to(self.default_workspace).as_posix()}",
            )
        )

        return CodeModificationPreview(
            file_path=path.relative_to(self.default_workspace).as_posix(),
            status="modified" if original_bytes is not None else "created",
            original_sha256=hashlib.sha256(original_bytes).hexdigest() if original_bytes is not None else None,
            diff="".join(diff_lines),
            lines_added=sum(line.startswith("+") and not line.startswith("+++ ") for line in diff_lines),
            lines_removed=sum(line.startswith("-") and not line.startswith("--- ") for line in diff_lines),
        )

    def apply_modification(
        self,
        file_path: str,
        new_content: str,
        expected_sha256: Optional[str],
    ) -> CodeModificationResult:
        preview = self.preview_modification(file_path, new_content)
        if preview.original_sha256 != expected_sha256:
            raise FileExistsError("The file changed after preview. Refresh it and review a new diff.")

        path = self._resolve_file(file_path)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temp_path: Optional[str] = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp",
                delete=False,
                newline="",
            ) as temp_file:
                temp_file.write(new_content)
                temp_path = temp_file.name
            os.replace(temp_path, path)
        except OSError:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
            raise

        return CodeModificationResult(
            file_path=preview.file_path,
            status=preview.status,
            lines_added=preview.lines_added,
            lines_removed=preview.lines_removed,
            diff_summary=f"+{preview.lines_added} / -{preview.lines_removed} lines",
        )

    async def run_tests(
        self,
        workspace_path: Optional[str] = None,
        test_target: Optional[str] = None,
        timeout_seconds: int = 30,
    ) -> TestExecutionResult:
        root = self._validate_path(Path(workspace_path) if workspace_path else self.default_workspace)
        if test_target:
            target = Path(test_target)
            if target.is_absolute() or ".." in target.parts or test_target.startswith("-"):
                raise PermissionError("Test target must be a relative path inside the workspace.")
            resolved_target = self._validate_path(root / target)
            if not resolved_target.exists():
                raise FileNotFoundError(f"Test target not found: {test_target}")
            target_arg = str(resolved_target.relative_to(root))
        else:
            target_arg = "."

        env = {
            key: value
            for key, value in os.environ.items()
            if key in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE"}
        }
        env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
        start_time = asyncio.get_running_loop().time()
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "--tb=short",
            target_arg,
            cwd=str(root),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_task = asyncio.create_task(_read_bounded_output(proc.stdout))
        stderr_task = asyncio.create_task(_read_bounded_output(proc.stderr))
        wait_task = asyncio.create_task(proc.wait())
        try:
            completed, _ = await asyncio.wait(
                (stdout_task, stderr_task, wait_task),
                timeout=timeout_seconds,
            )
            if len(completed) != 3:
                proc.kill()
                await asyncio.gather(stdout_task, stderr_task, wait_task, return_exceptions=True)
                return TestExecutionResult(
                    passed=False,
                    exit_code=-1,
                    duration_seconds=round(asyncio.get_running_loop().time() - start_time, 2),
                    stderr=f"Test execution timed out after {timeout_seconds} seconds.",
                )
        except asyncio.CancelledError:
            proc.kill()
            await asyncio.gather(stdout_task, stderr_task, wait_task, return_exceptions=True)
            raise

        duration = round(asyncio.get_running_loop().time() - start_time, 2)
        out_str = stdout_task.result().decode("utf-8", errors="replace")
        err_str = stderr_task.result().decode("utf-8", errors="replace")
        passed_count = sum(int(value) for value in re.findall(r"\b(\d+)\s+passed\b", out_str))
        failed_count = sum(int(value) for value in re.findall(r"\b(\d+)\s+failed\b", out_str))

        return TestExecutionResult(
            passed=proc.returncode == 0,
            exit_code=proc.returncode or 0,
            tests_run=passed_count + failed_count,
            tests_failed=failed_count,
            duration_seconds=duration,
            stdout=out_str,
            stderr=err_str,
        )
