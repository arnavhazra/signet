# Signet kernel

Python FastAPI HITL kernel: a **stateless DAG engine** plus a **server-driven wizard contract**. Human-in-the-loop is a UI node type. Sessions, audit, and remediations live in Postgres.

## Architecture

```
ExceptionEvent ──► FastAPI
                      ├─ exception_events outbox (DAG runs inline in the request)
                      ├─ DagEngine (stateless)
                      │      logic nodes run (expression, tool)
                      │      UI nodes halt (approval_card, …)
                      ├─ ToolGateway (allowlist + audit row before side effect)
                      └─ Postgres  workflows, sessions, audit_events, remediations, exception_events
```

- **WorkflowDefinition** — JSON of nodes, edges, and wizard steps (including server-only bindings).
- **WorkflowSession** — durable in Postgres. Replay key is `workflowId + version`.
- **Bindings** (`filter_value` | `filter_bracket` | `query_token`) never leave the server. `GET /v1/workflows/{slug}/active`, session snapshots, and replay payloads are stripped.
- **Publish** — immutable versions; at most one `published` row per slug.
- **Auth** — `X-API-Key`, Bearer JWT, or demo cookie (`GET /v1/auth/demo` when `DEMO_MODE=1`). Roles: `operator`, `checker`, `admin`, `auditor`.
- **Rate limits** — ingest and advance (IP and/or API key).

Hobby production: Vercel Python entry [`api/index.py`](../api/index.py) + Supabase Postgres. Redis and NATS are not on that path. `infra/` is an optional k8s envelope.

## Local run

Python **3.12** and a **Supabase** project (session-mode pooler).

```bash
cd runtime
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# DATABASE_URL=postgresql+asyncpg://…@aws-0-<region>.pooler.supabase.com:5432/postgres

alembic upgrade head
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Leave `TESTING` unset. Seed publishes `exception-review` and `nav-signoff` and prints keys.

```bash
curl -s localhost:8000/health
curl -s localhost:8000/ready
curl -s localhost:8000/v1/auth/demo          # Set-Cookie when DEMO_MODE=1
curl -s -H "X-API-Key: demo-runtime-key" localhost:8000/v1/inbox
```

Tests (SQLite in-memory):

```bash
cd runtime && pytest -q
```

`TESTING=1` is for unit tests only.

## HTTP API

Service listens on **0.0.0.0:8000**. Spec: `/openapi.json`.

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| GET | `/ready` | none (Postgres) |
| GET | `/v1/auth/demo` | none when `DEMO_MODE=1` |
| GET | `/v1/inbox` | cookie / JWT / `X-API-Key` |
| POST | `/v1/events/exceptions` | operator / checker / API key; optional `Idempotency-Key` |
| GET | `/v1/sessions/{id}` | cookie / JWT / API key |
| POST | `/v1/sessions/{id}/advance` | operator / checker / API key; `expectedUpdatedAt` → `409` |
| GET | `/v1/sessions/{id}/audit` | cookie / JWT / API key |
| GET | `/v1/sessions/{id}/replay` | cookie / JWT / API key |
| GET | `/v1/audit` | cookie / JWT / API key |
| GET | `/v1/workflows/{slug}/active` | cookie / JWT / API key |
| GET/POST | `/admin/workflows` | JWT `role=admin` |
| GET | `/admin/workflows/{id}` | admin |
| POST | `/admin/workflows/{id}/preview` | admin |
| POST | `/admin/workflows/{id}/publish` | admin |

Env: `DATABASE_URL`, `JWT_SECRET`, `API_KEYS`, `DEMO_MODE`, `CORS_ORIGINS`, `OTEL_EXPORTER_OTLP_ENDPOINT` (optional).

## Workflows

**exception-review**

1. Logic: `delta = bookQty - custodianQty`, attach synthetic citations.
2. UI halt: `approval_card` (`accept_adjustment` | `reject` | `request_more_data`).
3. If `|delta| >=` threshold, first accept moves to a checker `approval_card`. Two humans in the audit trail. Low delta completes in one step.
4. Accept → `write_remediation` FK-bound to an audit row.
5. Reject → close, no remediation. Request more data → `pending_more_data`.

**nav-signoff** — numeric override then approval. Same kernel, different JSON.

## Threat model

**Bindings leak.** Active, session, and replay payloads go through `strip_bindings`. Admin JWT can read full definitions; runtime keys and operators cannot. Tests assert `binding` / `filter_bracket` / `query_token` are absent from public GET.

**Tool IAM.** The DAG names the tool. Unknown tools are denied, audited, no side effect. Remediation rows require `audit_event_id`.

**Replay.** Publishing archives the previous published row (partial unique index). Sessions store `workflowId` + `version`.

**Authz.** Auditor cannot POST ingest/advance or admin writes. Runtime keys cannot publish. `org_id` + RLS on session/audit/remediation/event tables.

**Concurrency / idempotency.** Unique `(org_id, source)` and optional `Idempotency-Key` on ingest. Advance with stale `expectedUpdatedAt` returns `409`.
