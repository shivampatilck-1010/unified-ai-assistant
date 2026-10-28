from routers.browser_tasks import router as browser_tasks_router
from routers.calendar import router as calendar_router
from routers.chat import router as chat_router
from routers.conversations import router as conversations_router
from routers.providers import router as providers_router
from routers.reminders import router as reminders_router
from routers.tasks import router as tasks_router

__all__ = [
    "browser_tasks_router",
    "chat_router",
    "conversations_router",
    "providers_router",
    "tasks_router",
    "calendar_router",
    "reminders_router",
]
