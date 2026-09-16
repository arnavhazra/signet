# Signet

Governed HITL workflow kernel — a sealed audit stamp, not a chatbot. This is **not Addison**. Addison is conversational Q&A over portfolios. This repo is the **governed action layer** an Addison-class agent would call: event in, versioned DAG, server-driven approval form, permissioned write, audit + traces.

**Read this first (interview):** [`docs/interview-briefing.md`](docs/interview-briefing.md) — thesis, Addepar mapping, ThisVersus/ivt-mvp honesty, click-by-click demo, threat model, JD map, questions, what not to say.

Also: [`docs/demo-script.md`](docs/demo-script.md) (live timing), [`docs/addepar-mapping.md`](docs/addepar-mapping.md) (file-level JD table), [`runtime/README.md`](runtime/README.md) (kernel), [`web/README.md`](web/README.md) (SDUI client), [`infra/README.md`](infra/README.md) (kind / Terraform).

There is **no production web deploy** for this workspace (no Vercel project). The hiring-manager path is local.

## Demo loop (hiring-manager path)

Requires **Python 3.12**, a hosted **Supabase Postgres** project, and **Node 22** for the UI. **No Docker Desktop.** Redis and NATS stay in-process when localhost is unreachable.

### 1. Point the runtime at Supabase

Create or reuse a Supabase project. Copy env and set the **session-mode pooler** URL SQLAlchemy expects (`postgresql+asyncpg://…@aws-0-<region>.pooler.supabase.com:5432/postgres`). Never commit `.env`.

```bash
cd runtime
python3.12 -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then set DATABASE_URL to the pooled asyncpg URI
alembic upgrade head          # no-op if schema was already applied on the project
python -m app.seed            # prints API_KEY + ADMIN_JWT; slug=exception-review
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Do **not** set `TESTING=1` for this path — that switches the API to SQLite. Leave `OTEL_EXPORTER_OTLP_ENDPOINT` empty unless a collector is running.

Synthetic fixture: account **A-100**, security **US0378331005**.

### 2. Web (Vite `:5173`)

```bash
cd web
npm install
npm run dev                   # http://127.0.0.1:5173
```

Vite proxies `/v1`, `/health`, `/ready`, and `/admin/workflows` to the API, so the browser does not depend on CORS. The demo runtime key (`demo-runtime-key`) and a demo admin JWT are **preloaded** — do not open **Swap keys** for the hiring-manager path.

Then: `/` → **Inject mismatch** → **Accept adjustment** → read the plain-English audit trail. `/admin` loads the catalog without pasting a token.

`VITE_API_URL` is baked at build time for the Nginx image. Leave it unset for local Vite (proxy). Use `http://localhost:8000` for kind **port-forward**. `http://api:8000` is in-cluster DNS only — the browser cannot call it.

### 3. Same loop with curl

```bash
export API_KEY=demo-runtime-key   # or the value printed by seed

curl -s localhost:8000/health
curl -s localhost:8000/ready      # {status, checks: {postgres, redis, nats}}
# postgres must be true against Supabase. redis/nats are true in-process without Docker.

curl -s -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"accountId":"A-100","securityId":"US0378331005","bookQty":150,"custodianQty":120,"asOf":"2026-09-14","source":"synthetic-fixture"}' \
  localhost:8000/v1/events/exceptions
# status: awaiting_input, currentNode.artifactType: approval_card, derived.delta: 30

SID=<sessionId>
curl -s -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs":{"decision":"accept_adjustment"}}' \
  localhost:8000/v1/sessions/$SID/advance
# status: completed

curl -s -H "X-API-Key: $API_KEY" localhost:8000/v1/sessions/$SID/audit
# {events: [...]}  look for tool.invoked + remediation.written
```

Auth: `X-API-Key` on `/v1/*`; `Authorization: Bearer` JWT (`role=admin`) on `/admin/*`.

## Tests

```bash
cd runtime && pytest -q          # SQLite in-memory, no network
```

`TESTING=1` + SQLite is for unit tests only, not the hiring-manager envelope.

## Appendix: Docker Compose / kind (optional)

Docker Desktop is **not** required for the demo. Use this only if you want local Postgres/Redis/NATS/OTel instead of Supabase + in-process adapters.

```bash
cd runtime
docker compose up -d          # Postgres 16, Redis 7, NATS JetStream, OTel collector
```

Then set `DATABASE_URL=postgresql+asyncpg://hitl:hitl@localhost:5432/hitl` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

kind / Terraform: [`infra/README.md`](infra/README.md). Images match the Dockerfiles: `hitl-runtime-api:dev` (`runtime/Dockerfile`), `hitl-runtime-web:dev` (`web/Dockerfile`). Port-forward **3000** and **8000**; keep `VITE_API_URL=http://localhost:8000`.

Nginx image (port **3000**) for a dockerized UI:

```bash
docker build --build-arg VITE_API_URL=http://localhost:8000 -t hitl-runtime-web:dev web/
docker run --rm -p 3000:3000 hitl-runtime-web:dev
```
