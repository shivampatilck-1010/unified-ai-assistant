from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from auth import create_access_token
from config import get_settings
from main import app
from services.coding_agent import MAX_TEST_OUTPUT_BYTES, CodingAgent
from services.intelligence.context_manager import UnifiedContext
from services.intelligence.execution_controller import ExecutionController
from services.intelligence.task_planner import ExecutionStep, StructuredPlan


def test_preview_is_read_only_and_stale_changes_are_rejected(tmp_path):
    source = tmp_path / "main.py"
    source.write_text("print('before')\n", encoding="utf-8")
    agent = CodingAgent(default_workspace=str(tmp_path))

    preview = agent.preview_modification("main.py", "print('after')\n")
    assert preview.original_sha256
    assert "-print('before')" in preview.diff
    assert "+print('after')" in preview.diff
    assert source.read_text(encoding="utf-8") == "print('before')\n"

    source.write_text("print('concurrent change')\n", encoding="utf-8")
    with pytest.raises(FileExistsError, match="changed after preview"):
        agent.apply_modification(
            "main.py",
            "print('after')\n",
            expected_sha256=preview.original_sha256,
        )

    fresh_preview = agent.preview_modification("main.py", "print('after')\n")
    result = agent.apply_modification(
        "main.py",
        "print('after')\n",
        expected_sha256=fresh_preview.original_sha256,
    )
    assert result.status == "modified"
    assert source.read_text(encoding="utf-8") == "print('after')\n"


def test_workspace_rejects_paths_outside_its_root(tmp_path):
    agent = CodingAgent(default_workspace=str(tmp_path / "workspace"))
    outside_file = tmp_path / "outside.py"
    outside_file.write_text("secret = True\n", encoding="utf-8")

    with pytest.raises(PermissionError):
        agent.read_source_file(str(outside_file))
    with pytest.raises(PermissionError):
        agent.preview_modification("../outside.py", "overwritten = True\n")


@pytest.mark.asyncio
async def test_pytest_runner_uses_workspace_targets_without_shell(tmp_path):
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_ok.py").write_text("def test_ok():\n    assert 2 + 2 == 4\n", encoding="utf-8")
    agent = CodingAgent(default_workspace=str(tmp_path))

    result = await agent.run_tests(test_target="tests/test_ok.py", timeout_seconds=10)

    assert result.passed is True
    assert result.tests_run == 1
    assert result.tests_failed == 0
    with pytest.raises(PermissionError):
        await agent.run_tests(test_target="../outside.py", timeout_seconds=10)
    with pytest.raises(PermissionError):
        await agent.run_tests(test_target="--help", timeout_seconds=10)


@pytest.mark.asyncio
async def test_pytest_runner_enforces_timeout_and_bounds_output(tmp_path):
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_slow.py").write_text(
        "import time\n\ndef test_slow():\n    time.sleep(10)\n",
        encoding="utf-8",
    )
    agent = CodingAgent(default_workspace=str(tmp_path))

    timed_out = await agent.run_tests(test_target="tests/test_slow.py", timeout_seconds=2)
    assert timed_out.exit_code == -1
    assert "timed out" in timed_out.stderr.lower()

    (tests_dir / "test_output.py").write_text(
        "def test_large_failure():\n    print('x' * 400000)\n    assert False\n",
        encoding="utf-8",
    )
    failed = await agent.run_tests(test_target="tests/test_output.py", timeout_seconds=10)
    assert failed.passed is False
    assert len(failed.stdout.encode("utf-8")) <= MAX_TEST_OUTPUT_BYTES + 32


@pytest.mark.asyncio
async def test_coding_api_requires_auth_and_separates_user_workspaces(tmp_path, monkeypatch):
    settings = get_settings()
    secret = "test-secret-key-with-at-least-32-characters"
    monkeypatch.setattr(settings, "allow_dev_auth", False)
    monkeypatch.setattr(settings, "is_production", True)
    monkeypatch.setattr(settings, "jwt_secret_key", secret)
    monkeypatch.setattr(settings, "coding_workspace_root", str(tmp_path))
    monkeypatch.setattr(settings, "enable_coding_tests", False)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        unauthenticated = await client.post("/api/intelligence/coding/inspect", json={})
        assert unauthenticated.status_code == 401

        user_one_token = create_access_token(
            user_id="coding-user-one",
            secret_key=secret,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        user_two_token = create_access_token(
            user_id="coding-user-two",
            secret_key=secret,
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        user_one = {"Authorization": f"Bearer {user_one_token}"}
        user_two = {"Authorization": f"Bearer {user_two_token}"}

        preview = await client.post(
            "/api/intelligence/coding/preview",
            headers=user_one,
            json={"file_path": "src/main.py", "new_content": "print('safe')\n"},
        )
        assert preview.status_code == 200
        assert preview.json()["status"] == "created"

        apply = await client.post(
            "/api/intelligence/coding/modify",
            headers=user_one,
            json={
                "file_path": "src/main.py",
                "new_content": "print('safe')\n",
                "expected_sha256": None,
            },
        )
        assert apply.status_code == 200

        other_user_read = await client.post(
            "/api/intelligence/coding/read",
            headers=user_two,
            json={"file_path": "src/main.py"},
        )
        assert other_user_read.status_code == 404

        injected_workspace = await client.post(
            "/api/intelligence/coding/inspect",
            headers=user_one,
            json={"workspace_path": str(Path(__file__).parent), "max_files": 10},
        )
        assert injected_workspace.status_code == 200
        assert injected_workspace.json()["tests_enabled"] is False
        assert all(item["path"] != Path(__file__).name for item in injected_workspace.json()["files"])

        tests_disabled = await client.post(
            "/api/intelligence/coding/test",
            headers=user_one,
            json={},
        )
        assert tests_disabled.status_code == 503


@pytest.mark.asyncio
async def test_intelligence_coding_dispatch_is_user_scoped_and_respects_test_gate(
    tmp_path,
    monkeypatch,
):
    settings = get_settings()
    monkeypatch.setattr(settings, "coding_workspace_root", str(tmp_path))
    monkeypatch.setattr(settings, "enable_coding_tests", False)
    workspace_agent = CodingAgent.for_user("controller-user", str(tmp_path))
    workspace_agent.apply_modification("workspace.txt", "private workspace\n", None)

    async def tests_must_not_run(*_args, **_kwargs):
        raise AssertionError("Tests should be disabled")

    monkeypatch.setattr(CodingAgent, "run_tests", tests_must_not_run)
    plan = StructuredPlan(
        user_goal="Inspect the coding workspace",
        steps=[
            ExecutionStep(
                step_number=1,
                title="Inspect workspace",
                capability="coding_sandbox",
                assigned_agent="coding_agent",
                description="Inspect user workspace files",
                verification_criteria="Files inspected",
            )
        ],
    )

    result = await ExecutionController.execute_plan(
        db=None,
        plan=plan,
        context=UnifiedContext(user_id="controller-user"),
    )

    outcome = result["execution_outcome"]
    assert outcome["status"] == "success", outcome
    assert outcome["files_inspected"] >= 1
    assert outcome["tests_enabled"] is False
    assert "Disabled by server configuration" in outcome["result_summary"]
