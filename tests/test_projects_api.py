import pytest
from httpx import AsyncClient, ASGITransport
import sys
from pathlib import Path

# Add services/api to sys.path
api_dir = str(Path(__file__).resolve().parent.parent / "services" / "api")
if api_dir not in sys.path:
    sys.path.insert(0, api_dir)

from main import app
from database import create_tables


@pytest.mark.asyncio
async def test_projects_crud_and_scoping():
    # Ensure tables exist
    await create_tables()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a project
        create_res = await client.post(
            "/api/projects",
            json={
                "name": "E-Commerce Replatforming",
                "description": "Migration of store catalog to headless architecture",
                "system_prompt": "You are a senior Shopify and Next.js architect. Always provide code snippets in TypeScript.",
                "icon": "shopping-bag",
                "color": "#10b981",
                "pinned_file_ids": [],
            },
        )
        assert create_res.status_code == 201
        proj_data = create_res.json()
        project_id = proj_data["id"]
        assert proj_data["name"] == "E-Commerce Replatforming"
        assert proj_data["color"] == "#10b981"
        assert proj_data["conversation_count"] == 0

        # 2. List projects
        list_res = await client.get("/api/projects")
        assert list_res.status_code == 200
        list_data = list_res.json()
        assert list_data["total"] >= 1
        found = any(p["id"] == project_id for p in list_data["items"])
        assert found

        # 3. Create conversation scoped to this project
        conv_res = await client.post(
            f"/api/projects/{project_id}/conversations",
            json={"title": "Data Modeling Thread"},
        )
        assert conv_res.status_code == 201
        conv_data = conv_res.json()
        assert conv_data["project_id"] == project_id
        assert conv_data["title"] == "Data Modeling Thread"

        # 4. Get project details and verify conversation count and items
        detail_res = await client.get(f"/api/projects/{project_id}")
        assert detail_res.status_code == 200
        detail_data = detail_res.json()
        assert detail_data["conversation_count"] == 1
        assert len(detail_data["conversations"]) == 1
        assert detail_data["conversations"][0]["id"] == conv_data["id"]

        # 5. Update project settings
        patch_res = await client.patch(
            f"/api/projects/{project_id}",
            json={
                "name": "E-Commerce Master Hub",
                "color": "#6366f1",
            },
        )
        assert patch_res.status_code == 200
        updated = patch_res.json()
        assert updated["name"] == "E-Commerce Master Hub"
        assert updated["color"] == "#6366f1"

        # 6. Delete project and verify conversation is unlinked safely
        del_res = await client.delete(f"/api/projects/{project_id}")
        assert del_res.status_code == 204

        # Verify project is gone
        get_res = await client.get(f"/api/projects/{project_id}")
        assert get_res.status_code == 404

        # Verify conversation still exists (data retention preserved)
        conv_get = await client.get(f"/api/conversations/{conv_data['id']}")
        assert conv_get.status_code == 200
        assert conv_get.json()["id"] == conv_data["id"]
