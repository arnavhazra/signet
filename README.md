# Signet

Signet is a **human-in-the-loop (HITL) workflow kernel**: versioned DAGs, server-driven UI (SDUI), and audit-first tools. An exception event starts a durable session; logic nodes run on the server; UI nodes halt for a human; the only writes go through an allowlisted tool gateway that inserts an audit row before any remediation. It is not a chatbot.

Live: [signet-pearl-iota.vercel.app](https://signet-pearl-iota.vercel.app) — landing, inbox, maker-checker, replay, auditor, admin, agent. Synthetic book-vs-custodian data only. Signup and billing are simulated.

Repo: [github.com/arnavhazra/signet](https://github.com/arnavhazra/signet)

## Architecture

Hobby deploy is **same origin**: Vite SPA + FastAPI on Vercel. Postgres is hosted Supabase. There is no Redis or NATS in production. Ingest inserts an `exception_events` outbox row and runs the DAG in the same request.

```
Browser
  └─ Vercel Hobby (same origin)
        ├─ static SPA (web/)
        └─ rewrite /v1 /health /ready /admin /openapi.json /docs /mcp → FastAPI (api/index.py → runtime/)
              ├─ DagEngine (stateless; sessions in Postgres)
              ├─ ToolGateway (allowlist; audit row before side effect)
              ├─ Agent gateway (propose; server-side policy; MCP at /mcp)
              ├─ exception_events outbox
              └─ Supabase Postgres (workflows, sessions, audit_events, remediations)
```

| Layer | Role |
| --- | --- |
| `web/` | SDUI renderer. Paints artifact payloads and posts answers. Does not compute deltas or evaluate bindings. |
| `runtime/` | FastAPI kernel: DAG, wizard contract, tools, auth, audit, agent policy. |
| `api/index.py` | Vercel Python entry that imports the FastAPI app. |
| `infra/` | Optional Kubernetes / Terraform envelope. Not the live path. |

## Security

- **Stripped bindings.** Admin definitions may contain `binding` (`filter_value`, `filter_bracket`, `query_token`). `GET /v1/workflows/{slug}/active`, session snapshots, and replay payloads run through `strip_bindings`. The browser is a renderer; rules stay on the server.
- **Audit-first tools.** Clients cannot name tools. The DAG names an allowlisted `toolName`. Unknown tools are denied, audited, and produce no side effect. `remediations.audit_event_id` is a required FK.
- **Agent policy.** `POST /v1/agent/propose` and MCP tools classify intents on the server. Write-class proposals open a HITL session; reads are served and audited; unknown intents are denied with no side effect. Agents cannot name tools or skip dual control.
- **Roles.** `operator`, `checker`, `admin`, `auditor`. Auditor is GET-only (inbox, session, audit, replay). Operator/checker may ingest, advance, and propose. Advancing a `checker*` node (`checker_approval`) requires `checker` or `admin`; an operator receives `403`. Admin owns catalog, preview, publish. Runtime API keys cannot publish.
- **Auth.** Tests and local (`DEMO_MODE=0`) may use `X-API-Key`. Production demo (`DEMO_MODE=1`) mints an HttpOnly `signet_demo` cookie via `GET /v1/auth/demo` and returns a short-lived visitor JWT in JSON field `accessToken` for MCP `Authorization: Bearer`. Cookie-first SPA fetches do not send API keys. Subsequent `/v1`, `/mcp`, and `/admin` accept cookie or Bearer JWT; API keys are rejected in demo mode so a leaked key cannot join the shared org. Rate-limit ingest, advance, and propose by IP (and by key when present). `POST /v1/demo/reset` is rate-limited.
- **RLS and tenancy.** Rows carry `org_id`. Postgres RLS scopes sessions, audit, remediations, and events to the caller’s org. Demo mode mints a per-visitor `org_id` into the `signet_demo` cookie so each visitor gets an isolated inbox.

Every response includes `X-Request-Id` (echo incoming or generate).

## Console

The rail is a compact ops console: role radiogroup, queue badges, `⌘K` command palette.

| Path | Screen |
| --- | --- |
| `/` | Landing — governed action kernel; Open console |
| `/pricing` | Get in touch — mailto contact only |
| `/inbox` | Inbox — chips (`exception-review` / `nav-signoff` / `open` / `awaiting_checker` / `done`), New mismatch inject, account, CUSIP, book, custodian, server-derived delta, age, status |
| `/sessions/:id` | Decision — title is account · CUSIP · workflow; UUID subtitle. Accept / reject / request more data. High `\|delta\|` requires a second checker approval. |
| `/sessions/:id/replay` | Same account · CUSIP header. Immutable `workflowId` + `version`, stripped contract vs stored citations |
| `/audit` | Default-loads this visitor’s trail. Timeline: ingest → halt → agent/human → `remediation.written` |
| `/admin` | Shared catalog, lint on preview/publish, stripped contract fetch |
| `/agent` | Agent console — canned Write / Read / Deny, free-text prompt, typed proposal, policy verdict, audit row, curl / MCP. Contract tab uses visitor JWT Bearer, not an API key |
| `/settings` | Simulated profile, billing plan flip, usage counts, reset demo |

Seeded workflows: `exception-review` (maker-checker on large deltas) and `nav-signoff` (numeric override then approval). Same kernel, different definition JSON.

## Agent integration

Agents propose. They never execute a write. Policy on the server decides whether Signet can answer, must open a human session, or must deny.

A Supervisor-class agent (or any MCP client) points at `/mcp`. Signet is a tool that agent can call; it does not replace the agent’s planner. Console: `/agent`. Engineer notes: [`docs/integration.md`](docs/integration.md).

### Propose

```
POST /v1/agent/propose
{
  "intent": "resolve_break",
  "accountId": "A-214",
  "params": {},
  "rationale": "Book vs custodian delta exceeds threshold"
}

→ {
  "decision": "requires_human" | "auto_executed" | "denied",
  "policy": { "rule": "write_class_requires_human", "threshold": 100, "delta": 120 },
  "sessionId": "...",
  "approvalUrl": "/sessions/...",
  "auditEventId": "...",
  "proposal": { "intent": "resolve_break", "accountId": "A-214" }
}
```

Optional fields on the request: `text`, `intent`, `accountId`, `params`, `rationale`. `text` is free language; `intent` is already typed. Same response either way. On `requires_human`, the caller handles `approvalUrl`. The write has not landed.

### Policy

| Class | Intents | Decision | What happens |
| --- | --- | --- | --- |
| Write | `resolve_break`, `adjust_position` | `requires_human` | Opens a HITL session on the existing DAG. The agent gets an approval URL, not a completed write. Audit: `agent.proposed`. |
| Read | `list_exceptions`, `explain_break` | `auto_executed` | Served directly. Still audited (`agent.proposed`). |
| Unknown | anything else (including `delete_everything`) | `denied` | `agent.denied` audit row. No session, no remediation. |

### Canned examples

The `/agent` console ships three chips. Each is the same `POST /v1/agent/propose` contract.

**Write** — `resolve_break` on `A-214`:

```json
{ "intent": "resolve_break", "accountId": "A-214" }
```

Decision `requires_human`. Response includes `sessionId` and `approvalUrl`. Audit: `agent.proposed`. Humans still run maker-checker; `remediation.written` happens only after they advance the DAG.

**Read** — `list_exceptions`:

```json
{ "intent": "list_exceptions" }
```

Decision `auto_executed`. Inbox payload for the caller’s org is returned. Audit: `agent.proposed`. No session.

**Deny** — unknown intent:

```json
{ "intent": "delete_everything" }
```

Decision `denied`. Audit: `agent.denied`. No session, no remediation.

### MCP

Streamable HTTP at `/mcp`. A Supervisor-class agent registers this URL as an external MCP server. Auth on the public demo is the visitor JWT from `GET /v1/auth/demo` (`accessToken`) as `Authorization: Bearer`, or the demo cookie. Do not send `X-API-Key: demo-runtime-key` on the public origin.

| Tool | Role |
| --- | --- |
| `list_exceptions` | Read the open exception inbox |
| `propose_remediation` | Submit a write-class proposal. Policy still requires a human. The tool returns `approvalUrl`, not a posted write. |
| `get_session` | Session snapshot; bindings stripped |
| `get_audit` | Audit events |

Resource: `signet://inbox` (`resources/list` + `resources/read`) is the same payload as `list_exceptions`.

```json
{
  "mcpServers": {
    "signet": {
      "type": "http",
      "url": "https://signet-pearl-iota.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer <accessToken from GET /v1/auth/demo>"
      }
    }
  }
}
```

### Hybrid parser

If `LLM_API_KEY` is set, free text is parsed into a typed proposal (Vercel AI Gateway or an OpenAI-compatible endpoint). If it is not set, a deterministic parser produces the same shape. Policy always runs on the typed intent, never on the prose. The live demo does not require a model.

## HTTP API

Interactive spec: `/openapi.json` (FastAPI `/docs` when served).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/health` | none | `{status: ok}` |
| `GET` | `/ready` | none | 200 when Postgres is reachable |
| `GET` | `/v1/auth/demo` | none (`DEMO_MODE=1`) | Sets HttpOnly `signet_demo` cookie; JSON `{ ok, role, orgId, accessToken }` |
| `POST` | `/v1/demo/reset` | demo mode | Reseed this visitor’s inbox. Rate-limited. |
| `GET` | `/v1/inbox` | operator / checker / auditor / API key | `{ items: [{ sessionId, accountId, securityId, bookQty, custodianQty, delta, asOf, status, awaitingChecker, createdAt, workflowSlug }] }` — open and `awaiting_checker` first |
| `POST` | `/v1/events/exceptions` | operator / checker / API key | Ingest. Optional `Idempotency-Key`. Unique `(org_id, source)`. Replay of the same event returns the existing session `200`. Auditor `403`. |
| `POST` | `/v1/agent/propose` | operator / checker / API key | Body `{ text?, intent?, accountId?, params?, rationale? }`. Policy: write → human, read → served, unknown → denied. See Agent integration. |
| `GET` | `/v1/sessions/{id}` | operator / checker / auditor / API key | Session snapshot; bindings stripped |
| `POST` | `/v1/sessions/{id}/advance` | operator / checker / API key | Body `{ inputs, expectedUpdatedAt? }`. Stale version → `409 { error: CONFLICT }`. Auditor `403`. A `checker*` node requires `checker` or `admin`; operator → `403`. |
| `GET` | `/v1/sessions/{id}/audit` | operator / checker / auditor / API key | `{ events }` |
| `GET` | `/v1/sessions/{id}/replay` | operator / checker / auditor / API key | `{ workflowId, version, slug, stripped, citations, accumulatedAnswers, derived, createdAt }` |
| `GET` | `/v1/audit` | operator / checker / auditor / API key | Query `accountId`, `eventType`, `sessionId` → `{ events }` |
| `GET` | `/v1/workflows/{slug}/active` | API key / cookie / JWT | Public wizard contract; no `binding` keys |
| `GET` `POST` | `/mcp` | cookie / JWT | MCP Streamable HTTP. Tools: `list_exceptions`, `propose_remediation`, `get_session`, `get_audit`. Resource: `signet://inbox`. |
| `GET` `POST` | `/admin/workflows` | admin | List / create |
| `GET` | `/admin/workflows/{id}` | admin | Full definition (bindings may be present) |
| `POST` | `/admin/workflows/{id}/preview` | admin | Dry-run `{filters, derived}` plus linter issues |
| `POST` | `/admin/workflows/{id}/publish` | admin | Immutable version; previous published row archived |

Lint rejects cycles and tool nodes missing `toolName` before publish.

## Tests

```bash
cd runtime && pytest -q          # SQLite in-memory; no network
```

Kernel coverage: halt/resume, reject, more-data, maker-checker, checker-node `403` for operator, second workflow, bindings stripped on active + snapshots, idempotent ingest, concurrent advance `409`, tool deny `403`, lint (cycles, missing `toolName`), auditor cannot POST ingest/advance, auth and rate limit, agent policy (write blocked, read served, unknown denied), MCP list/call, visitor JWT + `signet://inbox` resource, per-visitor org isolation.

```bash
cd web && npm run test:e2e
cd web && npm run test:e2e:prod   # https://signet-pearl-iota.vercel.app
```

Playwright covers the interview path: tour FSM, inbox (unique A-214), maker-checker, operator 403 on the checker node, agent Write/Read/Deny + contract, audit, replay, admin strip, authz, 409, `/docs` `/mcp` `/openapi.json`. Local boots `TESTING=1` uvicorn + preview (cookie-first; `API_KEYS=demo-runtime-key`). `PLAYWRIGHT_BASE_URL` hits production; cold start is a 90s kernel wait, not a skip. `TESTING=1` is for unit tests / local Playwright only; do not set it against Supabase.

## Deploy

1. Vercel Hobby project, production from `main`. SPA build from `web/`; Python function from `api/index.py`. `vercel.json` rewrites `/v1/*`, `/health`, `/ready`, `/admin/workflows*`, `/openapi.json`, `/docs`, `/mcp` to the function; `/admin`, `/agent`, and other console routes are the Vite build.
2. Env (never in git): `DATABASE_URL` (Supabase **session** pooler, `postgresql+asyncpg://…:5432/postgres`), `JWT_SECRET`, `API_KEYS`, `DEMO_MODE=1`, `CORS_ORIGINS` = the Vercel origin. Optional `LLM_API_KEY` for natural-language proposals (deterministic parser if unset). Leave Deployment Protection off for the public demo.
3. `alembic upgrade head` against that database from `runtime/`.
4. One-shot seed from your machine (`python -m app.seed` or a private admin seed route). Visitors reseed their own org with `POST /v1/demo/reset`, not a global thousands-of-rows button.

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

Kernel notes: [`runtime/README.md`](runtime/README.md). Client notes: [`web/README.md`](web/README.md). Agent wiring: [`docs/integration.md`](docs/integration.md). Optional k8s/Terraform: [`infra/README.md`](infra/README.md).
