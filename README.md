# Signet

Signet is a **human-in-the-loop (HITL) workflow kernel**: versioned DAGs, server-driven UI (SDUI), and audit-first tools. An exception event starts a durable session; logic nodes run on the server; UI nodes halt for a human; the only writes go through an allowlisted tool gateway that inserts an audit row before any remediation. It is not a chatbot.

Live console: inbox, maker-checker decision, replay, auditor, admin. Synthetic book-vs-custodian data only.

Repo: [github.com/arnavhazra/signet](https://github.com/arnavhazra/signet)

## Architecture

Hobby deploy is **same origin**: Vite SPA + FastAPI on Vercel. Postgres is hosted Supabase. There is no Redis or NATS in production. Ingest inserts an `exception_events` outbox row and runs the DAG in the same request.

```
Browser
  └─ Vercel Hobby (same origin)
        ├─ static SPA (web/)
        └─ rewrite /v1 /health /ready /admin /openapi.json → FastAPI (api/index.py → runtime/)
              ├─ DagEngine (stateless; sessions in Postgres)
              ├─ ToolGateway (allowlist; audit row before side effect)
              ├─ exception_events outbox
              └─ Supabase Postgres (workflows, sessions, audit_events, remediations)
```

| Layer | Role |
| --- | --- |
| `web/` | SDUI renderer. Paints artifact payloads and posts answers. Does not compute deltas or evaluate bindings. |
| `runtime/` | FastAPI kernel: DAG, wizard contract, tools, auth, audit. |
| `api/index.py` | Vercel Python entry that imports the FastAPI app. |
| `infra/` | Optional Kubernetes / Terraform envelope. Not the live path. |

## Security

- **Stripped bindings.** Admin definitions may contain `binding` (`filter_value`, `filter_bracket`, `query_token`). `GET /v1/workflows/{slug}/active`, session snapshots, and replay payloads run through `strip_bindings`. The browser is a renderer; rules stay on the server.
- **Audit-first tools.** Clients cannot name tools. The DAG names an allowlisted `toolName`. Unknown tools are denied, audited, and produce no side effect. `remediations.audit_event_id` is a required FK.
- **Roles.** `operator`, `checker`, `admin`, `auditor`. Auditor is GET-only (inbox, session, audit, replay). Operator/checker may ingest and advance. Admin owns catalog, preview, publish. Runtime API keys cannot publish.
- **Auth.** `X-API-Key` on `/v1/*` for tests and local clients. Demo mode (`DEMO_MODE=1`) issues an HttpOnly `signet_demo` cookie via `GET /v1/auth/demo`. Subsequent `/v1` and `/admin` accept cookie, Bearer JWT, or API key. Rate-limit ingest and advance by IP (and by key when present).
- **RLS and tenancy.** Rows carry `org_id` (demo org constant). Postgres RLS scopes sessions, audit, remediations, and events to the caller’s org. Demo data is a single org.

Every response includes `X-Request-Id` (echo incoming or generate).

## Console

| Path | Screen |
| --- | --- |
| `/` | Inbox — account, CUSIP, book, custodian, server-derived delta, age, status (`open` / `awaiting_checker` / `done`) |
| `/sessions/:id` | Decision — SDUI card. Accept / reject / request more data. High `\|delta\|` requires a second checker approval. |
| `/sessions/:id/replay` | Immutable `workflowId` + `version`, stripped contract vs stored citations |
| `/audit` | Read-only search by account / session / event type |
| `/admin` | Catalog, lint on preview/publish, stripped contract fetch |

Seeded workflows: `exception-review` (maker-checker on large deltas) and `nav-signoff` (numeric override then approval). Same kernel, different definition JSON.

## HTTP API

Interactive spec: `/openapi.json` (FastAPI `/docs` when served).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | none | `{status: ok}` |
| `GET` | `/ready` | none | 200 when Postgres is reachable |
| `GET` | `/v1/auth/demo` | none (`DEMO_MODE=1`) | Sets HttpOnly `signet_demo` operator cookie |
| `GET` | `/v1/inbox` | operator / checker / auditor / API key | `{ items: [{ sessionId, accountId, securityId, bookQty, custodianQty, delta, asOf, status, awaitingChecker, createdAt, workflowSlug }] }` — open and `awaiting_checker` first |
| `POST` | `/v1/events/exceptions` | operator / checker / API key | Ingest. Optional `Idempotency-Key`. Unique `(org_id, source)`. Replay of the same event returns the existing session `200`. Auditor `403`. |
| `GET` | `/v1/sessions/{id}` | operator / checker / auditor / API key | Session snapshot; bindings stripped |
| `POST` | `/v1/sessions/{id}/advance` | operator / checker / API key | Body `{ inputs, expectedUpdatedAt? }`. Stale version → `409 { error: CONFLICT }`. Auditor `403`. |
| `GET` | `/v1/sessions/{id}/audit` | operator / checker / auditor / API key | `{ events }` |
| `GET` | `/v1/sessions/{id}/replay` | operator / checker / auditor / API key | `{ workflowId, version, slug, stripped, citations, accumulatedAnswers, derived, createdAt }` |
| `GET` | `/v1/audit` | operator / checker / auditor / API key | Query `accountId`, `eventType`, `sessionId` → `{ events }` |
| `GET` | `/v1/workflows/{slug}/active` | API key / cookie / JWT | Public wizard contract; no `binding` keys |
| `GET` `POST` | `/admin/workflows` | admin | List / create |
| `GET` | `/admin/workflows/{id}` | admin | Full definition (bindings may be present) |
| `POST` | `/admin/workflows/{id}/preview` | admin | Dry-run `{filters, derived}` plus linter issues |
| `POST` | `/admin/workflows/{id}/publish` | admin | Immutable version; previous published row archived |

Lint rejects cycles and tool nodes missing `toolName` before publish.

## Tests

```bash
cd runtime && pytest -q          # SQLite in-memory; no network
```

Kernel coverage: halt/resume, reject, more-data, maker-checker, second workflow, bindings stripped on active + snapshots, idempotent ingest, concurrent advance `409`, tool deny `403`, lint (cycles, missing `toolName`), auditor cannot POST ingest/advance, auth and rate limit.

```bash
cd web && npx playwright test    # inbox → maker-checker → audit → replay
```

Playwright hits a preview or production URL (or local same-origin). `TESTING=1` is for unit tests only; do not set it against Supabase.

## Deploy

1. Vercel Hobby project, production from `main`. SPA build from `web/`; Python function from `api/index.py`. `vercel.json` rewrites `/v1/*`, `/health`, `/ready`, `/admin/*`, `/openapi.json` to the function; everything else is the Vite build.
2. Env (never in git): `DATABASE_URL` (Supabase **session** pooler, `postgresql+asyncpg://…:5432/postgres`), `JWT_SECRET`, `API_KEYS`, `DEMO_MODE=1`, `CORS_ORIGINS` = the Vercel origin. Leave Deployment Protection off for the public demo.
3. `alembic upgrade head` against that database from `runtime/`.
4. One-shot seed from your machine (`python -m app.seed` or a private admin seed route). Do not expose a public button that re-seeds thousands of rows.

Local same-origin substitute:

```bash
cd runtime
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # DATABASE_URL = session-mode pooler URI
alembic upgrade head && python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000

cd web && npm install && npm run dev   # http://127.0.0.1:5173, proxies /v1 and /admin
```

Kernel notes: [`runtime/README.md`](runtime/README.md). Client notes: [`web/README.md`](web/README.md). Optional k8s/Terraform: [`infra/README.md`](infra/README.md).
