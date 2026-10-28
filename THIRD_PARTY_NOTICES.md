# Third-Party Notices & Dependency License Audit

This document records the licenses and notices for all third-party dependencies incorporated into the **Unified AI Assistant** project across Phase 0 (Scaffolding), Phase 1 (Chat Workspace), and Phase 2 (Server Persistence & Unified Model Gateway).

---

## License Summary Table

| Ecosystem | Permissive (MIT, Apache-2.0, BSD, ISC, PSF) | Weak Copyleft (MPL-2.0, LGPL with exceptions) | Unverified / Flagged | Total Audited |
| :--- | :---: | :---: | :---: | :---: |
| **Frontend (`apps/web`)** | 26 | 2 (`lightningcss`) | 0 | 28 |
| **Backend (`services/api`)** | 37 | 2 (`certifi`, `psycopg2-binary`) | 1 (`annotated-doc`) | 40 |

---

## Frontend Dependencies (`apps/web`)

Audited via `package.json` and `package-lock.json` metadata.

| Package | Version | Declared License | Status / Usage |
| :--- | :--- | :--- | :--- |
| `@oxc-project/types` | 0.155.0 | MIT | Verified |
| `@oxlint/binding-win32-x64-msvc` | 1.90.0 | MIT | Verified |
| `@rolldown/binding-win32-x64-msvc`| 1.2.15 | MIT | Verified |
| `@rolldown/pluginutils` | 1.0.1 | MIT | Verified |
| `@types/node` | 24.19.2 | MIT | Verified |
| `@types/react` | 19.3.0 | MIT | Verified |
| `@types/react-dom` | 19.3.0 | MIT | Verified |
| `@typescript/typescript-win32-x64`| 7.0.2 | Apache-2.0 | Verified |
| `@vitejs/plugin-react` | 6.1.2 | MIT | Verified |
| `csstype` | 3.2.3 | MIT | Verified |
| `detect-libc` | 2.1.2 | Apache-2.0 | Verified |
| `fdir` | 6.5.0 | MIT | Verified |
| `lightningcss` | 1.33.0 | MPL-2.0 | Verified (Build tool / binary component) |
| `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 | Verified (Build tool / binary component) |
| `nanoid` | 3.3.20 | MIT | Verified |
| `oxlint` | 1.90.0 | MIT | Verified |
| `picocolors` | 1.1.1 | ISC | Verified |
| `picomatch` | 4.0.7 | MIT | Verified |
| `postcss` | 8.5.32 | MIT | Verified |
| `react` | 19.3.1 | MIT | Verified |
| `react-dom` | 19.3.1 | MIT | Verified |
| `rolldown` | 1.2.15 | MIT | Verified |
| `scheduler` | 0.28.0 | MIT | Verified |
| `source-map-js` | 1.2.2 | BSD-3-Clause | Verified |
| `tinyglobby` | 0.2.17 | MIT | Verified |
| `typescript` | 7.0.2 | Apache-2.0 | Verified |
| `undici-types` | 7.24.6 | MIT | Verified |
| `vite` | 8.3.5 | MIT | Verified |

---

## Backend Dependencies (`services/api`)

Audited via Python `importlib.metadata` and `requirements.lock` on 2026-10-28.

| Package | Version | Declared License | Status / Notes |
| :--- | :--- | :--- | :--- |
| `aiosqlite` | 0.22.1 | MIT | Verified (Phase 2 async SQLite driver) |
| `alembic` | 1.20.1 | MIT | Verified (Phase 2 schema migration framework) |
| `annotated-doc` | 0.0.5 | **UNVERIFIED** | **Flagged**: Package metadata omits `License` and `Classifier` fields. Transitive dependency of `fastapi` 0.162.0. Upstream inspection required before production release. |
| `annotated-types` | 0.8.0 | MIT | Verified |
| `anthropic` | 0.125.0 | MIT | Verified (Phase 2 Anthropic Claude client) |
| `anyio` | 4.15.1 | MIT | Verified |
| `asyncpg` | 0.32.0 | Apache-2.0 | Verified (Phase 2 async PostgreSQL driver) |
| `certifi` | 2026.10.23 | MPL-2.0 | Verified (CA bundle data file) |
| `click` | 8.5.0 | BSD-3-Clause | Verified |
| `colorama` | 0.4.6 | BSD-3-Clause | Verified via classifier `License :: OSI Approved :: BSD License` |
| `fastapi` | 0.162.0 | MIT | Verified |
| `google-genai` | 1.75.0 | Apache-2.0 | Verified (Phase 2 Google Gemini client) |
| `greenlet` | 3.5.6 | MIT AND PSF-2.0 | Verified (SQLAlchemy async bridge) |
| `h11` | 0.16.0 | MIT | Verified |
| `httpcore` | 1.0.9 | BSD-3-Clause | Verified |
| `httptools` | 0.9.0 | MIT | Verified |
| `httpx` | 0.28.1 | BSD-3-Clause | Verified |
| `idna` | 3.20 | BSD-3-Clause | Verified |
| `iniconfig` | 2.3.1 | MIT | Verified |
| `mako` | 1.4.3 | MIT | Verified (Alembic template engine) |
| `markupsafe` | 3.0.4 | BSD-3-Clause | Verified (Mako dependency) |
| `openai` | 1.109.1 | Apache-2.0 | Verified (Phase 2 OpenAI client) |
| `opentelemetry-api` | 1.45.1 | Apache-2.0 | Verified |
| `packaging` | 26.3 | Apache-2.0 OR BSD-2-Clause | Verified |
| `playwright` | 1.64.1 | Apache-2.0 | Verified (Phase 3 browser automation runtime) |
| `pluggy` | 1.7.0 | MIT | Verified |
| `psycopg2-binary` | 2.9.13 | LGPL with exceptions | Verified (Alembic sync PostgreSQL inspection driver; includes explicit psycopg2 license exception permitting proprietary and non-GPL dynamic linking) |
| `pydantic` | 2.14.1 | MIT | Verified |
| `pydantic_core` | 2.50.1 | MIT | Verified |
| `pyee` | 14.0.0 | MIT | Verified (Playwright event emitter) |
| `Pygments` | 2.21.0 | BSD-2-Clause | Verified |
| `pytest` | 8.4.2 | MIT | Verified |
| `pytest-asyncio` | 1.4.1 | Apache-2.0 | Verified (Phase 2 async pytest extension) |
| `python-dotenv` | 1.2.4 | BSD-3-Clause | Verified |
| `PyYAML` | 6.0.3 | MIT | Verified |
| `sqlalchemy` | 2.1.6 | MIT | Verified (Phase 2 ORM & async engine) |
| `starlette` | 1.10.0 | BSD-3-Clause | Verified |
| `typing-inspection` | 0.4.4 | MIT | Verified |
| `typing_extensions` | 4.16.0 | PSF-2.0 | Verified |
| `tzdata` | 2026.6 | Apache-2.0 | Verified (Phase 4 IANA timezone provider for Windows) |
| `uvicorn` | 0.54.0 | BSD-3-Clause | Verified |
| `watchfiles` | 1.3.0 | MIT | Verified |
| `websockets` | 17.3 | BSD-3-Clause | Verified |

---

## Action Items for Unverified & Weak-Copyleft Items
1. **`annotated-doc`**: Manually inspect upstream repository license terms during Phase 3 to verify redistribution compatibility.
2. **`lightningcss` & `certifi` (MPL-2.0)**: Used as standalone external tools/data without modifying upstream source files. Conforms with standard MPL-2.0 section 3 requirements.
3. **`psycopg2-binary` (LGPL with exceptions)**: Used strictly as a runtime binary library for Alembic offline schema reflection; the standard psycopg exception explicitly permits distribution without requiring disclosure of caller application code.
