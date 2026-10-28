# Autonomous Agent Worker (services/agent-worker)

## Purpose
Background execution worker handling long-running autonomous browser tasks and multi-step agent plans.

## Planned Architecture (Future Phases)
- Local Chrome DevTools Protocol (CDP) / WebDriver automation interface.
- Isolated containerized cloud browser execution environment.
- Task queue consumer with heartbeat monitoring and state checkpoints.
- Safe tool execution boundaries with human-in-the-loop approvals.

## Status in Phase 0
- Scaffolding initialized.
- Deferred heavy agent frameworks (Browser Use, LangChain, etc.) per Phase 0 constraints.
