from routers.browser_tasks import router as browser_tasks_router
from routers.calendar import router as calendar_router
from routers.chat import router as chat_router
from routers.conversations import router as conversations_router
from routers.files import router as files_router
from routers.knowledge import router as knowledge_router
from routers.orchestration import router as orchestration_router
from routers.providers import router as providers_router
from routers.reminders import router as reminders_router
from routers.research import router as research_router
from routers.tasks import router as tasks_router
from routers.wifi_sensing import router as wifi_sensing_router
from routers.retention import router as retention_router

__all__ = [
    "browser_tasks_router",
    "chat_router",
    "conversations_router",
    "orchestration_router",
    "providers_router",
    "tasks_router",
    "calendar_router",
    "reminders_router",
    "files_router",
    "knowledge_router",
    "research_router",
    "wifi_sensing_router",
    "retention_router",
]
