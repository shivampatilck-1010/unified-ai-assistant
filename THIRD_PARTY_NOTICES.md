# Third-Party Notices & Dependency License Audit

This document records the licenses and notices for all third-party dependencies incorporated into the **Unified AI Assistant** project during Phase 0 foundation scaffolding.

---

## License Summary Table

| Ecosystem | Permissive (MIT, Apache-2.0, BSD, ISC, PSF) | Weak Copyleft (MPL-2.0) | Unverified / Flagged | Total Audited |
| :--- | :---: | :---: | :---: | :---: |
| **Frontend (`apps/web`)** | 26 | 2 (`lightningcss`) | 0 | 28 |
| **Backend (`services/api`)** | 26 | 1 (`certifi`) | 1 (`annotated-doc`) | 28 |

---

## Frontend Dependencies (`apps/web`)

Audited via `package.json` and `package-lock.json` metadata on 2026-10-28.

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
| `annotated-doc` | 0.0.5 | **UNVERIFIED** | **Flagged**: Package metadata omits `License` and `Classifier` fields. Transitive dependency of `fastapi` 0.162.0. Upstream inspection required before production release. |
| `annotated-types` | 0.8.0 | MIT | Verified |
| `anyio` | 4.15.1 | MIT | Verified |
| `certifi` | 2026.10.23 | MPL-2.0 | Verified (CA bundle data file) |
| `click` | 8.5.0 | BSD-3-Clause | Verified |
| `colorama` | 0.4.6 | BSD-3-Clause | Verified via classifier `License :: OSI Approved :: BSD License` |
| `fastapi` | 0.162.0 | MIT | Verified |
| `h11` | 0.16.0 | MIT | Verified |
| `httpcore` | 1.0.9 | BSD-3-Clause | Verified |
| `httptools` | 0.9.0 | MIT | Verified |
| `httpx` | 0.28.1 | BSD-3-Clause | Verified |
| `idna` | 3.20 | BSD-3-Clause | Verified |
| `iniconfig` | 2.3.1 | MIT | Verified |
| `opentelemetry-api` | 1.45.1 | Apache-2.0 | Verified |
| `packaging` | 26.3 | Apache-2.0 OR BSD-2-Clause | Verified |
| `pluggy` | 1.7.0 | MIT | Verified |
| `pydantic` | 2.14.1 | MIT | Verified |
| `pydantic_core` | 2.50.1 | MIT | Verified |
| `Pygments` | 2.21.0 | BSD-2-Clause | Verified |
| `pytest` | 8.4.2 | MIT | Verified |
| `python-dotenv` | 1.2.4 | BSD-3-Clause | Verified |
| `PyYAML` | 6.0.3 | MIT | Verified |
| `starlette` | 1.10.0 | BSD-3-Clause | Verified |
| `typing-inspection` | 0.4.4 | MIT | Verified |
| `typing_extensions` | 4.16.0 | PSF-2.0 | Verified |
| `uvicorn` | 0.54.0 | BSD-3-Clause | Verified |
| `watchfiles` | 1.3.0 | MIT | Verified |
| `websockets` | 17.3 | BSD-3-Clause | Verified |

---

## Action Items for Unverified & Weak-Copyleft Items
1. **`annotated-doc`**: Manually inspect upstream repository license terms during Phase 1 to verify redistribution compatibility.
2. **`lightningcss` & `certifi` (MPL-2.0)**: Used as standalone external tools/data without modifying upstream source files. Conforms with standard MPL-2.0 section 3 requirements.
