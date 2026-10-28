import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_and_get_conversation():
    # User A creates a conversation
    headers_a = {"Authorization": "Bearer test-user-a"}
    res = client.post("/api/conversations", json={"title": "Project Alpha Discussion"}, headers=headers_a)
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Project Alpha Discussion"
    assert data["owner_id"] == "test-user-a"
    conv_id = data["id"]

    # Get conversation
    get_res = client.get(f"/api/conversations/{conv_id}", headers=headers_a)
    assert get_res.status_code == 200
    detail = get_res.json()
    assert detail["id"] == conv_id
    assert detail["title"] == "Project Alpha Discussion"
    assert detail["messages"] == []


def test_list_and_pagination():
    headers = {"Authorization": "Bearer test-pagination-user"}
    # Create 3 conversations
    for i in range(3):
        client.post("/api/conversations", json={"title": f"Conv {i}"}, headers=headers)

    # List with limit 2
    res = client.get("/api/conversations?limit=2&offset=0", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data["items"]) == 2
    assert data["total"] >= 3
    assert data["limit"] == 2
    assert data["offset"] == 0


def test_rename_conversation():
    headers = {"Authorization": "Bearer test-rename-user"}
    res = client.post("/api/conversations", json={"title": "Original Title"}, headers=headers)
    conv_id = res.json()["id"]

    # Rename
    patch_res = client.patch(f"/api/conversations/{conv_id}", json={"title": "Renamed Title"}, headers=headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Renamed Title"

    # Verify updated
    get_res = client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert get_res.json()["title"] == "Renamed Title"


def test_delete_conversation():
    headers = {"Authorization": "Bearer test-delete-user"}
    res = client.post("/api/conversations", json={"title": "To Delete"}, headers=headers)
    conv_id = res.json()["id"]

    # Delete
    del_res = client.delete(f"/api/conversations/{conv_id}", headers=headers)
    assert del_res.status_code == 204

    # Verify not found
    get_res = client.get(f"/api/conversations/{conv_id}", headers=headers)
    assert get_res.status_code == 404


def test_ownership_isolation():
    # User 1 creates conversation
    headers_1 = {"Authorization": "Bearer user-one"}
    res = client.post("/api/conversations", json={"title": "Private User 1 Notes"}, headers=headers_1)
    conv_id = res.json()["id"]

    # User 2 attempts to get User 1's conversation -> 404
    headers_2 = {"Authorization": "Bearer user-two"}
    get_res = client.get(f"/api/conversations/{conv_id}", headers=headers_2)
    assert get_res.status_code == 404
    assert "not found" in get_res.json()["detail"].lower()

    # User 2 attempts to rename User 1's conversation -> 404
    patch_res = client.patch(f"/api/conversations/{conv_id}", json={"title": "Hacked Title"}, headers=headers_2)
    assert patch_res.status_code == 404

    # User 2 attempts to delete User 1's conversation -> 404
    del_res = client.delete(f"/api/conversations/{conv_id}", headers=headers_2)
    assert del_res.status_code == 404

    # User 1 can still access it
    ok_res = client.get(f"/api/conversations/{conv_id}", headers=headers_1)
    assert ok_res.status_code == 200


def test_search_conversations():
    headers = {"Authorization": "Bearer search-user"}
    # Create conversation with specific title
    client.post("/api/conversations", json={"title": "Quantum Computing Fundamentals"}, headers=headers)

    # Search title
    search_res = client.get("/api/conversations/search?q=Quantum", headers=headers)
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["total"] >= 1
    assert any("Quantum" in m["snippet"] for m in data["matches"])

    # Search with another user returns 0 matches
    other_headers = {"Authorization": "Bearer different-search-user"}
    other_res = client.get("/api/conversations/search?q=Quantum", headers=other_headers)
    assert other_res.json()["total"] == 0
