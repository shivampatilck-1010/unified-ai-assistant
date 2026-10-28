# Unified AI Assistant

A unified personal AI workspace combining conversational intelligence, an autonomous browser agent, calendar/task management, and non-intrusive Wi-Fi sensing in a single, cohesive interface.

---

## Highlights

* **Claude-Inspired Dark Chat Interface**: Minimalist, distraction-free environment featuring large serif typography for AI responses.
* **Unified Workspace Sidebar**:
  * 💬 **New Chat**: Clean conversation reset with model configuration.
  * 🔍 **Search**: Full-text conversational and resource search.
  * 📁 **Projects**: Scoped workspaces with custom instructions and context.
  * 🌐 **Browser Agent**: Autonomous web task execution with interactive step preview.
  * 📅 **Calendar & Tasks**: Natural-language task creation, agenda, and reminders.
  * 📚 **Files & Knowledge**: Uploaded documents, citations, and knowledge store.
  * 📡 **Wi-Fi Sensing**: Ambient presence awareness and room activity state.
  * ⚙️ **Settings**: Server-side model key management and preferences.
* **Security First**: Hosted AI provider keys remain strictly server-side. Zero client-side API key exposure.
* **Modern Full-Stack Architecture**: React 19 + TypeScript + Vite frontend with a high-performance FastAPI backend.

---

## Directory Structure

```
unified-ai-assistant/
├── apps/
│   ├── web/                    # React 19 + TypeScript + Vite frontend
│   └── chrome-extension/       # Chrome extension for local browser bridge
├── services/
│   ├── api/                    # Core FastAPI backend & gateway
│   ├── agent-worker/           # Autonomous browser agent execution worker
│   └── wifi-sensing/           # Isolated Wi-Fi CSI sensing service (simulation)
├── packages/
│   ├── shared-schemas/         # Shared TypeScript interfaces & API contracts
│   └── ui/                     # UI components & dark theme design system
├── docs/
│   ├── architecture.md         # Full system architecture & phased roadmap
│   ├── repository-audit.md     # Phase 0 environment, dependency & license audit
│   └── threat-model.md         # STRIDE threat model & security controls
├── tests/
│   └── test_health.py          # Backend health-check integration test
├── .env.example                # Environment variables template
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

# Start backend server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The FastAPI backend will be available at:
* **Root API info**: `http://127.0.0.1:8000/`
* **Health Check**: `http://127.0.0.1:8000/health`
* **Interactive Docs**: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup & Run

Open a separate terminal window:

```bash
# Navigate to web application
cd apps/web

# Install dependencies
npm install

# Start development server
npm run dev
```

The web application will be accessible at `http://localhost:5173/`.

### 3. Running Verification Tests

```bash
# From repository root using the backend virtual environment:
services/api/.venv/Scripts/python -m pytest tests/test_health.py -v
```

---

## Documentation

* [System Architecture](file:///docs/architecture.md) — Subsystem designs, data flows, and phased roadmap.
* [Repository Audit Report](file:///docs/repository-audit.md) — Pre-modification audit, lockfiles, and license findings.
* [Security Threat Model](file:///docs/threat-model.md) — STRIDE analysis, trust boundaries, and mitigations.
* [Third-Party Notices](file:///THIRD_PARTY_NOTICES.md) — License inventory for all dependencies.

---

## Development Phases

* **Phase 0 — Repository Foundation** *(Completed)*: Scaffolding, dependency manifests, lockfiles, license audits, and verified health endpoints.
* **Phase 1 — Claude-Inspired Chat UI & Layout**: Dark workspace theme, sidebar navigation, serif typography, and real streaming contracts.
* **Phase 2 — Persistence & Model Gateway**: Database models (PostgreSQL), server-side hosted model integration (OpenAI, Anthropic, Gemini).
* **Phase 3 — Autonomous Browser Agent**: Local Chrome CDP integration and safety guardrails.
* **Phase 4 — Task & Calendar Engine**: Natural-language scheduling and internal calendar.
* **Phase 5 — Wi-Fi Sensing Service**: Environmental CSI simulation and presence events.
* **Phase 6 — Hardening & Cloud Browser Execution**: Sandbox isolation and production deployment.
