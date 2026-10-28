# Unified AI Assistant

A unified personal AI workspace combining conversational intelligence, server persistence, hosted AI model providers, an autonomous browser agent, calendar/task management, and non-intrusive Wi-Fi sensing in a single, cohesive interface.

---

## Highlights

* **Claude-Inspired Dark Chat Interface**: Minimalist, distraction-free environment featuring large serif typography for AI responses (Georgia 21px / line-height 1.6).
* **Unified Workspace Sidebar**:
  * 💬 **New Chat**: Clean conversation reset with dynamic model selection.
  * 🔍 **Search**: Database-backed full-text search across titles and messages.
  * 📁 **Projects**: Scoped workspaces with custom instructions and context.
  * 🌐 **Browser Agent**: Autonomous web task execution with interactive step preview.
  * 📅 **Calendar & Tasks**: Natural-language task creation, agenda, and reminders.
  * 📚 **Files & Knowledge**: Uploaded documents, citations, and knowledge store.
  * 📡 **Wi-Fi Sensing**: Ambient presence awareness and room activity state.
  * ⚙️ **Settings**: Server-side model key management and preferences.
* **Server Persistence & Dual Dialect**: SQLAlchemy 2.x and Alembic migrations supporting production PostgreSQL and local SQLite fallback.
* **Unified Model Gateway**: Server-side client adapters for OpenAI, Anthropic, and Google Gemini with normalized error handling (`RATE_LIMIT_EXCEEDED`, `TIMEOUT`, `PROVIDER_UNAVAILABLE`, `AUTHENTICATION_FAILED`).
* **Autonomous Browser Agent (Phase 3)**: Microsoft Playwright-powered background execution worker running in isolated ephemeral sessions without touching user everyday profiles. Features structured plan generation, strict action allowlists, SSRF/private IP blocking with post-navigation redirect revalidation, untrusted DOM prompt injection defense, consequential action confirmation gates, and real-time SSE progress streaming.
* **Task & Calendar Engine (Phase 4)**: Internal task management with idempotent completion toggling, calendar events with bounded RRULE recurrence expansion, atomic background reminder scheduler surviving server restarts, and natural language task/event extraction via the ModelGateway with mandatory operator review and confirmation before database persistence.
* **Files & Knowledge Engine (Phase 5)**: Secure private document storage outside public web routes, modular text extractors (PDF via pypdf, DOCX via python-docx, TXT, MD, CSV, Code/JSON), magic byte validation, content SHA-256 deduplication, bounded chunking with page/section provenance, pluggable embedding providers with dual-strategy retrieval (semantic vector search with cosine similarity + honest lexical fallback), grounded Q&A with strict prompt injection isolation, verified citation badges `[Doc: filename, Page X]`, streaming RAG chat integration, and full Claude-inspired frontend files workspace.
* **Web Research & Browser Intelligence (Phase 6)**: Autonomous, source-grounded research investigations with provider-neutral search discovery, isolated Playwright evidence extraction, SSRF/private IP blocking with post-navigation redirect revalidation, DOM prompt injection defense, grounded synthesis with traceable citations (`[Web N: Title]` and Phase 5 document correlation `[Doc: filename, Page X]`), honest insufficient evidence reporting, Markdown report exports, and SSE chat streaming integration.
* **Wi-Fi Sensing Service (Phase 7)**: Modular, consent-based environmental awareness subsystem. Features deterministic synthetic CSI simulation (`is_simulated = True`), honest hardware adapter reporting unavailability when specialized CSI capture NICs are absent, statistical presence and motion estimation with explicit `unknown` state for degraded data, tenant-isolated zone configurations, configurable retention policies with one-click purge, immutable audit trail, assistant tool orchestration integration, and dark-themed frontend monitor.
* **Production Hardening & Cloud Browser Execution (Phase 8)**: Production-ready operational boundary featuring fail-closed HMAC-SHA256 JWT authentication, Playwright network egress interception aborting subresource SSRF and cloud metadata access (`169.254.169.254`), atomic conditional SQL task claiming with worker restart recovery, defensive security headers, sliding-window rate limiting, payload bounds (15MB), structured logging with automated secret scrubbing, deep readiness probe (`/ready`), multi-stage Dockerfiles for non-root API, Worker, and Web services, and complete operational disaster recovery runbooks.
* **Unified AI Orchestration Engine (Phase 9)**: Autonomous coordination layer unifying Model Gateway, Knowledge Retrieval, Web Research, Browser Agent, Tasks/Calendar/Reminders, and Wi-Fi Sensing. Features ambiguity detection with clarification gates, rigid capability allowlisting, consequential action confirmation gates (pausing before persistent task/event creation), topological DAG dependency ordering with concurrent execution of independent safe steps via `asyncio.gather`, shared context variable interpolation (`{step_N.output.field}`), consolidated source provenance citations (`[Doc: filename, Page X]`, `[Web N: Title]`, `[Synthetic Observation: ... (Simulated)]`), optimistic plan versioning, dangling workflow recovery, real-time SSE streaming, and complete dark-mode Orchestration management workspace.
* **Security First**: Hosted AI provider keys and database connection strings remain strictly server-side. Zero client-side API key exposure. Strict identity ownership boundaries enforce that users cannot read, mutate, or search conversations belonging to other identities.
* **Modern Full-Stack Architecture**: React 19 + TypeScript + Vite frontend with a high-performance FastAPI backend.

---

## Directory Structure

```
unified-ai-assistant/
├── apps/
│   ├── web/                    # React 19 + TypeScript + Vite frontend
│   └── chrome-extension/       # Chrome extension for local browser bridge
├── services/
│   ├── api/                    # Core FastAPI backend & Unified Model Gateway
│   │   ├── alembic/            # Alembic database migrations
│   │   ├── models/             # SQLAlchemy 2.x models (Conversation, Message)
│   │   ├── schemas/            # Pydantic v2 schemas
│   │   ├── providers/          # OpenAI, Anthropic, Gemini provider adapters
│   │   ├── services/           # ModelGateway, ConversationService, StreamingService
│   │   ├── routers/            # API endpoints: chat, conversations, providers
│   │   ├── database.py         # Async engine & session lifecycle
│   │   ├── config.py           # Environment settings & validation
│   │   └── main.py             # FastAPI entrypoint & lifespan
│   ├── agent-worker/           # Autonomous browser agent execution worker
│   └── wifi-sensing/           # Isolated Wi-Fi CSI sensing service (simulation)
├── deploy/                     # Deployment configurations & operational runbooks
│   ├── nginx.conf              # Nginx reverse proxy, security headers & SSE configuration
│   └── backup-restore.md       # PostgreSQL backup, DR restore, migrations & secret rotation
├── packages/
│   ├── shared-schemas/         # Shared TypeScript interfaces & API contracts
│   └── ui/                     # UI components & dark theme design system
├── docs/
│   ├── architecture.md         # Full system architecture & phased roadmap
│   ├── repository-audit.md     # Phase 0 environment, dependency & license audit
│   └── threat-model.md         # STRIDE threat model & security controls
├── tests/
│   ├── conftest.py             # Test database setup fixture
│   ├── test_conversations_api.py # Database CRUD, pagination, search & ownership tests
│   ├── test_model_gateway.py   # Gateway resolution, mock streaming & error tests
│   ├── test_health.py          # Backend health-check integration test
│   ├── test_streaming.py       # SSE streaming contract & error tests
│   ├── test_browser_agent.py   # Autonomous browser agent integration tests
│   ├── test_tasks_calendar_reminders.py # Tasks, calendar, recurrence, reminders & NL tests
│   ├── test_files_and_knowledge.py # Uploads, extraction, provenance, search, RAG & injection tests
│   ├── test_web_research.py    # Web research, SSRF defense, synthesis & citation tests
│   ├── test_wifi_sensing.py    # Wi-Fi sensing simulation, tenant isolation & tool tests
│   └── test_hardening_and_isolation.py # Production auth, SSRF, claiming, restart recovery & probes
├── Dockerfile.api              # Non-root multi-stage Python API container
├── Dockerfile.worker           # Isolated non-root Playwright Chromium execution boundary
├── Dockerfile.web              # Multi-stage React 19 build + Nginx static asset runner
├── docker-compose.prod.yml     # Production multi-service orchestration with resource limits
├── .env.production.example     # Production environment secrets template
├── .env.example                # Local environment variables template
├── .gitignore                  # Git ignore rules
├── README.md                   # This file
└── THIRD_PARTY_NOTICES.md      # Audited dependency licenses & third-party notices
```

---

## Prerequisites

* **Node.js**: `>= 20.0.0` (Verified on `v24.19.0`)
* **npm**: `>= 10.0.0` (Verified on `11.17.0`)
* **Python**: `3.12.x` (Verified on `3.12.7`)
* **Git**: `>= 2.40.0` (Verified on `2.48.1`)

---

## Quickstart

### 1. Backend Setup & Run

From the repository root:

```bash
# Navigate to API service
cd services/api

# Create Python virtual environment (if not already created)
py -3.12 -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (CMD):
.venv\Scripts\activate.bat
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser binary (Chromium)
playwright install chromium

# Run database migrations
alembic upgrade head

# Start backend server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The FastAPI backend will be available at:
* **Root API info**: `http://127.0.0.1:8000/`
* **Health Check**: `http://127.0.0.1:8000/health`
* **Provider Status**: `http://127.0.0.1:8000/api/provider/status`
* **Conversations API**: `http://127.0.0.1:8000/api/conversations`
* **Search API**: `http://127.0.0.1:8000/api/conversations/search?q={query}`
* **Chat SSE Stream**: `http://127.0.0.1:8000/api/chat/stream`
* **Browser Worker Status**: `http://127.0.0.1:8000/api/browser/worker/status`
* **Browser Tasks API**: `http://127.0.0.1:8000/api/browser/tasks`
* **Browser Task Events SSE**: `http://127.0.0.1:8000/api/browser/tasks/{id}/stream`
* **Tasks API**: `http://127.0.0.1:8000/api/tasks`
* **Calendar Events API**: `http://127.0.0.1:8000/api/calendar/events`
* **Reminders API**: `http://127.0.0.1:8000/api/reminders`
* **Files Management API**: `http://127.0.0.1:8000/api/files`
* **Knowledge Retrieval & Grounded Q&A**: `http://127.0.0.1:8000/api/knowledge/search`, `/api/knowledge/answer`
* **Web Research Investigations API**: `http://127.0.0.1:8000/api/research/jobs`
* **Web Research Report Export**: `http://127.0.0.1:8000/api/research/jobs/{id}/export`
* **Interactive Docs**: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup & Run

Open a separate terminal window:

```bash
# Navigate to web application
cd apps/web

# Optional: configure backend URL in .env (defaults to http://127.0.0.1:8000)
cp .env.example .env

# Install dependencies
npm install

# Start development server
npm run dev
```

The web application will be accessible at `http://localhost:5173/`.

### 3. Running Verification Tests

```bash
# Run all backend tests (CRUD, gateway, streaming, health, ownership):
services/api/.venv/Scripts/python -m pytest tests -v

# Run frontend linting & production build:
cd apps/web
npm run lint
npm run build
```

---

## Documentation

* [System Architecture](file:///docs/architecture.md) — Subsystem designs, SSE streaming contract, database persistence, and phased roadmap.
* [Repository Audit Report](file:///docs/repository-audit.md) — Pre-modification audit, lockfiles, and license findings.
* [Security Threat Model](file:///docs/threat-model.md) — STRIDE analysis, trust boundaries, ownership controls, and secret isolation.
* [Third-Party Notices](file:///THIRD_PARTY_NOTICES.md) — License inventory for all dependencies.

---

## Development Phases

* **Phase 0 — Repository Foundation** *(Completed)*: Scaffolding, dependency manifests, lockfiles, license audits, and verified health endpoints.
* **Phase 1 — Production-Quality Chat Workspace** *(Completed)*: Claude-inspired dark UI, sidebar navigation (8 items), Georgia serif AI typography, verified health connectivity, typed SSE streaming contract, and responsive layout.
* **Phase 2 — Server Persistence & Unified AI Model Gateway** *(Completed)*: Dual-dialect PostgreSQL/SQLite database persistence, Alembic migrations, strict identity ownership boundaries, Unified Model Gateway with OpenAI, Anthropic, and Gemini adapters, conversation CRUD, database text search, and client UI integration.
* **Phase 3 — Autonomous Browser Agent** *(Completed)*: Playwright background execution worker in isolated sessions, structured plan approval workflow, strict action allowlist, SSRF private IP blocking, redirect revalidation, prompt-injection defense, consequential action confirmation gates, SSE progress streaming, and interactive frontend Browser Agent workspace.
* **Phase 4 — Task & Calendar Engine** *(Completed)*: Internal task tracking with idempotent completion toggling, calendar events with bounded RRULE recurrence expansion, atomic background reminder scheduler surviving restarts, natural language task/event extraction via ModelGateway with mandatory operator confirmation, strict ownership isolation, and Claude-inspired dark Calendar & Tasks workspace.
* **Phase 5 — Files & Knowledge Engine** *(Completed)*: Secure private document storage outside public web routes, modular text extractors (PDF via pypdf, DOCX via python-docx, TXT, MD, CSV, Code/JSON), magic byte validation, content SHA-256 deduplication, bounded chunking with page/section provenance, pluggable embedding providers with dual-strategy retrieval (semantic vector search with cosine similarity + honest lexical fallback), grounded Q&A with strict prompt injection isolation, verified citation badges `[Doc: filename, Page X]`, streaming RAG chat integration, and full Claude-inspired frontend files workspace.
* **Phase 6 — Web Research & Browser Intelligence** *(Completed)*: Autonomous, source-grounded research investigations with provider-neutral search discovery, isolated Playwright evidence extraction, SSRF/private IP blocking with post-navigation redirect revalidation, DOM prompt injection defense, grounded synthesis with traceable citations (`[Web N: Title]` and Phase 5 document correlation `[Doc: filename, Page X]`), honest insufficient evidence reporting, Markdown report exports, and SSE chat streaming integration.
* **Phase 7 — Wi-Fi Sensing Service** *(Completed)*: Modular, consent-based environmental awareness subsystem with deterministic synthetic CSI modeling, transparent simulation labeling, honest hardware capability reporting, baseline statistical presence estimation, tenant-isolated zone configs, retention purges, audit logging, assistant tool grounding, and interactive frontend monitor.
* **Phase 8 — Hardening & Cloud Browser Execution**: Sandbox isolation and production deployment.
