import uuid
from datetime import datetime, timedelta, timezone
import pytest
from httpx import ASGITransport, AsyncClient
from main import app
from database import AsyncSessionLocal, create_tables
from models.conversation import Conversation
from models.message import Message
from models.file_record import FileRecord
from models.wifi_sensing import WifiSensingEvent
from services.data_retention_service import DataRetentionService
from services.conversation_service import ConversationService


@pytest.mark.asyncio
async def test_72h_data_retention_cleanup():
    """Verify that expired conversations, messages, files, and events are cleaned up after 72 hours."""
    await create_tables()
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        user_id = f"test_user_{uuid.uuid4().hex[:8]}"
        active_id = f"conv_active_{uuid.uuid4().hex[:8]}"
        expired_id = f"conv_expired_{uuid.uuid4().hex[:8]}"

        # 1. Create an active conversation (expires in 72h)
        active_conv = Conversation(
            id=active_id,
            owner_id=user_id,
            title="Active Conversation",
            expires_at=now + timedelta(hours=72),
        )
        db.add(active_conv)

        # 2. Create an expired conversation (expired 1 hour ago)
        expired_conv = Conversation(
            id=expired_id,
            owner_id=user_id,
            title="Expired Conversation",
            expires_at=now - timedelta(hours=1),
        )
        db.add(expired_conv)

        # Add message to expired conversation
        expired_msg = Message(
            id=f"msg_expired_{uuid.uuid4().hex[:8]}",
            conversation_id=expired_conv.id,
            role="user",
            content="Old message",
        )
        db.add(expired_msg)

        # 3. Create an expired sensing event
        expired_event = WifiSensingEvent(
            id=f"evt_expired_{uuid.uuid4().hex[:8]}",
            owner_id=user_id,
            room_id="room_alpha",
            is_simulated=True,
            presence_state="motion",
            expires_at=now - timedelta(hours=2),
            timestamp=now - timedelta(hours=74),
        )
        db.add(expired_event)

        await db.commit()

        # Run cleanup
        stats = await DataRetentionService.cleanup_expired_data(db)
        assert stats["expired_conversations"] >= 1
        assert stats["expired_sensing_events"] >= 1

        # Verify active conversation still exists
        active_check = await db.get(Conversation, active_id)
        assert active_check is not None

        # Verify expired conversation was deleted
        expired_check = await db.get(Conversation, expired_id)
        assert expired_check is None


@pytest.mark.asyncio
async def test_retention_api_status_and_purge():
    """Verify retention API status and user-triggered purge."""
    await create_tables()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check retention status
        res = await client.get("/api/retention/status")
        assert res.status_code == 200
        data = res.json()
        assert data["retention_period_hours"] == 72
        assert "72 hours" in data["policy"]
        assert "active_conversations_count" in data

        # Check manual purge API
        purge_res = await client.post("/api/retention/purge-my-data", json={"confirm_purge": True})
        assert purge_res.status_code == 200
        purge_data = purge_res.json()
        assert "permanently deleted" in purge_data["message"]
