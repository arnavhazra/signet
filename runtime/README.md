# Signet (kernel)

Python FastAPI kernel: a **stateless DAG engine** plus a **server-driven wizard contract**. Human-in-the-loop is a first-class UI node, not a special case bolted onto a chatbot.

This is **not Addison**. Addison answers questions over portfolio data. This runtime is the layer an Addison-class agent would *call* when an action needs oversight: event in, deterministic DAG, SDUI approval form, permissioned tool write, audit + traces.

Contracts were extracted from private ThisVersus platform primitives (DagDig, configurable wizards, NATS dataplane) and rewritten here. Product code was not copied.

## Architecture

```
ExceptionEvent ──► FastAPI (0.0.0.0:8000)
                      │
                      ├─► NATS JetStream  EXCEPTIONS / exceptions.received
                      │     (in-process MemoryBus when NATS is not running)
                      ├─► DagEngine (stateless)
                      │      logic nodes run (expression, tool)
                      │      UI nodes halt (approval_card, …)
                      ├─► ToolGateway (allowlist + mandatory audit)
                      ├─► Postgres  workflows, sessions, audit_events, remediations
                      │     (hosted Supabase; not Docker Desktop)
                      ├─► Redis     active workflow cache (invalidate on publish)
                      │     (in-process MemoryCache when Redis is not running)
                      └─► OpenTelemetry spans: dag.node, queue.consume, tool.call
```

- **WorkflowDefinition** — JSON of nodes, edges, and wizard steps (including server-only bindings).
- **WorkflowSession** — durable in Postgres (not process memory). Replay by `workflowId + version`.
- **Bindings** (`filter_value` | `filter_bracket` | `query_token`) never leave the server. `GET /v1/workflows/{slug}/active` returns artifact configs only.
- **Publish** — immutable versions, at most one `published` row per slug, Redis key `workflow:active:{slug}` dropped on publish.
- **Auth** — `X-API-Key` on `/v1/*`; `Authorization: Bearer` JWT (`role=admin|operator`) on `/admin/*`. Admin routes require `admin`.
- **Rate limits** — Redis (or in-memory when Redis is down / in tests) on `POST /v1/events/exceptions` and `POST /v1/sessions/{id}/advance`.

## Quick start (local, no Docker)

Requires **Python 3.12** (3.14 does not have wheels for some pinned deps) and a **Supabase** project.

```bash
cd runtime
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL to the Supabase session-mode pooler URI (postgresql+asyncpg://…:5432/postgres)
# Leave TESTING unset. Redis/NATS URLs may stay at localhost — the API falls back in-process.

alembic upgrade head
python -m app.seed            # publishes slug=exception-review, prints ADMIN_JWT + API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Seed prints `API_KEY`, `ADMIN_JWT`, and the synthetic fixture (`A-100` / `US0378331005`). The Vite client preloads `demo-runtime-key` plus a demo admin JWT — hiring managers should not need Credentials.

```bash
# liveness / readiness
curl -s localhost:8000/health
curl -s localhost:8000/ready     # postgres = Supabase; redis/nats = in-process without Docker

# runtime: stripped wizard (no bindings)
curl -s -H "X-API-Key: demo-runtime-key" \
  localhost:8000/v1/workflows/exception-review/active

# ingest mismatch → DAG runs until approval_card halt
curl -s -H "X-API-Key: demo-runtime-key" -H "Content-Type: application/json" \
  -d '{"accountId":"A-100","securityId":"US0378331005","bookQty":150,"custodianQty":120,"asOf":"2026-09-14","source":"synthetic-fixture"}' \
  localhost:8000/v1/events/exceptions

# approve → audited remediation row
curl -s -H "X-API-Key: demo-runtime-key" -H "Content-Type: application/json" \
  -d '{"inputs":{"decision":"accept_adjustment"}}' \
  localhost:8000/v1/sessions/<SESSION_ID>/advance

curl -s -H "X-API-Key: demo-runtime-key" \
  localhost:8000/v1/sessions/<SESSION_ID>/audit
```

`POST /v1/events/exceptions` publishes to NATS **and** processes in-process (idempotent on event fingerprint), so the demo works with a single API process and no JetStream.

Tests (SQLite in-memory):

```bash
cd runtime && pytest -q
```

## Frozen HTTP API

Service listens on **0.0.0.0:8000**.

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none → `{status: ok}` |
| GET | `/ready` | none → 200 iff Postgres + Redis + NATS reachable (in-process adapters count) |
| GET/POST | `/admin/workflows` | JWT `role=admin` |
| GET | `/admin/workflows/{id}` | JWT admin |
| POST | `/admin/workflows/{id}/preview` | JWT admin |
| POST | `/admin/workflows/{id}/publish` | JWT admin |
| GET | `/v1/workflows/{slug}/active` | `X-API-Key` |
| POST | `/v1/events/exceptions` | `X-API-Key` |
| GET | `/v1/sessions/{id}` | `X-API-Key` |
| POST | `/v1/sessions/{id}/advance` | `X-API-Key` |
| GET | `/v1/sessions/{id}/audit` | `X-API-Key` |

Env: `DATABASE_URL` (Supabase pooled `postgresql+asyncpg://…`), `REDIS_URL`, `NATS_URL`, `JWT_SECRET`, `API_KEYS` (comma-separated), `OTEL_EXPORTER_OTLP_ENDPOINT` (optional).

## Exception-review vertical

Published slug `exception-review`:

1. Logic: `delta = bookQty - custodianQty`, attach synthetic book + custodian citations.
2. UI halt: `approval_card` with `accept_adjustment | reject | request_more_data`.
3. Accept → tool gateway writes `remediations` **FK-bound to an audit row** (cannot persist a write without audit).
4. Reject → close with optional `reason`.
5. Request more data → complete as `pending_more_data`.

## Threat model

**Bindings leak.** The rules *are* the product. Active and session payloads are passed through `strip_bindings`. Cache stores only the public document. Admin JWT can read full definitions; runtime API keys cannot. Tests assert `binding` / `filter_bracket` are absent from `GET /v1/workflows/{slug}/active`.

**Tool IAM.** Clients cannot name tools. The DAG definition names an allowlisted `toolName` (`attach_citations`, `write_remediation`, `close_exception`). Unknown tools are denied, audited, and produce no side effect. Remediation rows require `audit_event_id`.

**Replay.** Workflow versions are immutable. Publishing archives the previous published row for that slug (partial unique index). Every session stores `workflowId` + `version`. Re-running `DagEngine.advance` against that version reconstructs why a given approval form was shown.

**Authz split.** Runtime keys cannot publish. Operator JWTs cannot call `/admin/*`. Secrets live in env, not in the repo.

## This is not Addison

| Addison | This kernel |
|---|---|
| Conversational Q&A over portfolios | Versioned, admin-authored SDUI + DAG |
| Permission-aware answers | Permissioned **writes** with HITL |
| Databricks / Unity Catalog serving | Postgres sessions, NATS ingress, OTel |
| Product surface | Platform primitive an agent would invoke |

Do not demo this as a wealth chatbot. Demo it as the governed action layer.

## Appendix: Docker Compose (optional)

Not part of the hiring-manager path. If you want local Redis/NATS/OTel/Postgres instead of Supabase + in-process adapters:

```bash
docker compose up -d          # Postgres, Redis, NATS JetStream, OTel collector
```

Then `DATABASE_URL=postgresql+asyncpg://hitl:hitl@localhost:5432/hitl` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

Optional standalone JetStream consumer (the API already consumes in-process when NATS is up):

```bash
python -m app.worker
```
