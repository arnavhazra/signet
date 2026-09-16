# Addepar JD → this demo

Staff-plus screening is software engineering first: production services, data models, eventing, IAM, observability — not another LLM wrapper. This table maps typical Addepar platform / AI-infra JD bullets onto **files you can open** and **a step in the live demo**.

This workspace is a **governed HITL workflow runtime**. It is not an Addison clone.

| JD bullet (paraphrased) | Where it lives | Demo step |
|---|---|---|
| Production Python service, typed APIs, operational envelope | `runtime/app/main.py`, `runtime/app/routes/*.py`, `runtime/Dockerfile` (listen `0.0.0.0:8000`, `HEALTHCHECK /health`) | `curl /health` then `/ready` |
| Data models + migrations | `runtime/app/models/entities.py`, `runtime/alembic/versions/001_initial_schema.py` | Show `workflows` (immutable versions, one published per slug), `workflow_sessions`, `audit_events`, `remediations` |
| Stateless orchestration / repeatable workflow steps | `runtime/app/engine/dag.py` (`DagEngine`), `runtime/app/engine/nodes.py`, `runtime/app/engine/linter.py` | Ingest one exception; DAG runs logic then **halts** on a UI node |
| Server-driven UI; rules not shipped to the browser | `runtime/app/wizard/resolver.py`, `runtime/app/wizard/bindings.py`, `runtime/app/wizard/strip.py` | `GET /v1/workflows/exception-review/active` — no `binding` field. Contrast `GET /admin/workflows/{id}` |
| Versioned publish + replay (“why did this user see this form?”) | `runtime/app/services/workflows.py` (`publish_workflow`, Redis `workflow:active:{slug}` invalidate) | Publish vN, show archived vN-1, session snapshot carries `workflowId` + `version` |
| Event-driven ingress (same class of problem as ADX / data ops) | `runtime/app/services/nats.py` (stream `EXCEPTIONS`, subject `exceptions.received`), `runtime/app/worker.py`, `runtime/app/services/exceptions.py` | `POST /v1/events/exceptions` publishes **and** processes in-process |
| Human-in-the-loop / data-ops exception remediation | `runtime/app/seeds/exception_review.py` | Approval card: accept / reject / request more data on A-100 vs US0378331005 |
| Tool execution with audit (no silent writes) | `runtime/app/services/tools.py` — allowlist, `audit_events` inserted first, `remediations.audit_event_id` FK | After accept, `GET /v1/sessions/{id}/audit` shows `tool.invoked` + `remediation.written` |
| AuthN/Z, API keys vs admin IAM | `runtime/app/auth/deps.py` — `X-API-Key` runtime; JWT `role=admin\|operator` | Operator JWT → 403 on `/admin/*`; runtime key cannot publish |
| Rate limits on hot write paths | `runtime/app/services/rate_limit.py` on `exceptions` + `advance` | Mention 30/min default (`RATE_LIMIT_PER_MINUTE`) |
| Structured logs + traces | `runtime/app/logging.py` (JSON + `trace_id`), `runtime/app/otel.py` spans `dag.node`, `queue.consume`, `tool.call` | Jaeger/collector via `OTEL_EXPORTER_OTLP_ENDPOINT`; local collector in `runtime/docker-compose.yml` |
| Readiness vs liveness | `runtime/app/routes/health.py` | `/health` always `{status: ok}`; `/ready` requires Postgres + Redis + NATS |
| Infra as code / k8s probes (platform envelope) | Owned by the platform agent: `terraform/`, k8s manifests, CI. This kernel exposes the probes those charts wrap. | Point at `/health` + `/ready` + Dockerfile `HEALTHCHECK` |
| Tests as the contract | `runtime/tests/test_resolver.py`, `test_bindings_stripped.py`, `test_dag_halt_resume.py` | `cd runtime && pytest -q` |

## Talking sequence (use this, not “I built a chatbot”)

1. You already have Addison for pull Q&A. The hard platform problem is **action with oversight**.
2. I built a **stateless DAG runtime** where UI is a node type, so HITL is not a special case.
3. Rules stay on the server (SDUI + stripped bindings). Versions are immutable so you can replay any decision.
4. The same kernel can host data-ops exceptions, client-prep packs, or reporting sign-off without a new frontend.
5. Around it: Postgres/Redis/NATS, OTel, API keys + JWT roles — the operational envelope this role owns.

## What we deliberately did not build

Portfolio NL Q&A, document extraction, Databricks, a fake Addepar UI, or ThisVersus storefront/scrapers. Those would read as intern work or as competing with Addison. This demo is the **kernel those agents would sit on**.
