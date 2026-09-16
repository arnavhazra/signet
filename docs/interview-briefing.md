# Interview briefing — Addepar Staff SWE, AI Platform

Read this before the loop. The live demo is **Signet** at `http://127.0.0.1:5173`. Prod is **not** deployed (no Vercel project for this repo); the hiring-manager path is local Vite + FastAPI against hosted Supabase Postgres.

---

## 1. One-sentence thesis

Addepar already ships conversational Q&A over portfolios; I built the **governed action layer** those agents would call — a versioned, server-driven HITL kernel where events become a DAG, the DAG halts on an SDUI form, a human decides, and the only writes go through an audited tool gateway.

---

## 2. What Addepar already has

Speak as if you have done the homework. Do not pretend you worked on these products.

| Surface | What it is | Implication for this role |
|---|---|---|
| **Addison** | Permission-aware conversational Q&A over household / portfolio data | Pull path. Answers, not writes. |
| **Intelligent Statements** | Document / statement intelligence in the product | Extraction and presentation, not a workflow kernel. |
| **ADX** | Addepar’s data / interchange plane | Evented, operational data movement — same *class* of problem as exception ingress. |
| **Data-ops agent (preview)** | Agent-shaped ops on data quality / exceptions | Needs **action with oversight**: repeatable steps, a human in the loop, tools that cannot write silently, replay when compliance asks why a form looked like that. |

The gap on an AI Platform JD is not “another chatbot.” It is the substrate: typed APIs, durable sessions, IAM split, traces, and a place to put HITL that is not a special case bolted onto a prompt.

---

## 3. What you built that they do not ship

**Signet** — a Python FastAPI kernel + a thin SDUI client.

It is **not Addison**. It does not chat over positions. It does this:

```
exception event  →  NATS (or in-process bus)  →  stateless DAG
                 →  halt on approval_card
                 →  human decision
                 →  allowlisted tool write (remediation FK → audit row)
                 →  versioned session + audit + OTel spans
```

Properties you can defend in the room:

- **UI is a node type.** HITL is not a callback hack. The engine is stateless; Postgres holds the session.
- **Bindings never leave the server.** `GET /v1/workflows/:slug/active` is a different document from the admin definition. The browser is a renderer.
- **No silent writes.** `ToolGateway` inserts `audit_events` first; `remediations.audit_event_id` is a required FK.
- **Replay.** Immutable workflow versions; every session stores `workflowId` + `version`.
- **Operational envelope.** FastAPI, Supabase Postgres, Redis/NATS with in-process fallback, JSON logs + OTel (`dag.node`, `queue.consume`, `tool.call`), `/health` vs `/ready`, Terraform/k8s under `infra/`.

The vertical is **book vs custodian exception review** (account `A-100`, CUSIP `US0378331005`) because it rhymes with a data-ops agent, not because you are shipping a reconciliation product.

---

## 4. How it maps to ThisVersus / ivt-mvp

Honest framing: this repo is a **Python rewrite of platform primitives** you already shipped in an e-commerce stack. It is **not** the ThisVersus storefront, not a product finder, not scrapers.

| Primitive (ThisVersus / ivt-mvp) | Where it lived | Signet equivalent |
|---|---|---|
| Configurable SDUI wizards | `reference/backend-ts` wizard admin + `GET /api/ai/wizards/:slug/active` | `runtime/app/wizard/*`, `GET /v1/workflows/{slug}/active` |
| Bindings stay server-side (`filter_value`, `filter_bracket`, `query_token`) | Comment in `wizardController`: “binding intentionally stripped — server-only” | `strip_bindings` + `public_steps`; tests in `test_bindings_stripped.py` |
| Resolver turns answers into `{filters, query, derived}` | `WizardResolver.ts` | `runtime/app/wizard/resolver.py` |
| **DagDig** — stateless DAG, UI nodes halt, logic nodes run, sessions carry memory | `reference/workflow` (TS, originally in-memory sessions) | `runtime/app/engine/dag.py` + Postgres `workflow_sessions` |
| NATS dataplane | backend `lib/nats.ts`, ETL sync messages | `runtime/app/services/nats.py` stream `EXCEPTIONS` / `exceptions.received` |
| Mapping / dataplane schema | ETL `MAPPING_SPEC`, entity types for wizard field validation | Not cloned. The kernel’s “dataplane” here is exception events + tool IAM, not product catalog mapping. |

What you **did** extract: wizard contract, stripped bindings, DAG halt/resume, versioned publish, API-key vs admin IAM.

What you **did not** copy: storefront UI, Gemini product ranking, scrapers, category catalogs, e-commerce query templates. If asked “did you lift ThisVersus into wealth?” the answer is **no** — you rewrote the kernel those wizards sat on, in the language and envelope this JD uses (Python, Postgres, events, OTel).

---

## 5. Demo walkthrough (click-by-click, current UI)

Servers: API `:8000` (uvicorn, Supabase, **do not** set `TESTING=1`), web `:5173`. Open **`http://127.0.0.1:5173`**. Do **not** open **Swap keys**. The demo runtime key and admin JWT are preloaded.

### Operator (`/`) — 90 seconds

1. **Frame the page** (30 seconds, no clicks). Rail says “Governed HITL workflow kernel — not Addison.” The lede says this is a renderer. Three thesis lines: event in, DAG on the server, you decide. Phase chips: Event ingested → DAG ran on server → Waiting on you → Audited write.
2. Click **Inject mismatch**. Do not touch Credentials.
   - Kernel reachable stays green.
   - Status pill: **Waiting on you**.
   - Banner: event ingested, DAG computed delta and citations on the server, halted on the approval card.
   - Card title: **Book vs custodian mismatch**. Kicker: **Human decision**.
   - Facts on the card are **server-derived** (delta, account, security) — you did not subtract 10000 − 9850 in the browser.
   - Right rail: **Citations · server-derived** (book ledger + custodian feed record ids) and **Server-derived** `delta`.
   - Audit trail already has plain English: “Event ingested”, “DAG halted for a human”.
3. Click **Accept adjustment** (not Reject / Request more data unless you want the no-write path).
   - Status: **Completed**.
   - Banner: adjustment accepted; remediation cannot exist without an audit row.
   - Audit: “Human decision recorded” → “Tool invoked: write_remediation” → “Remediation written”.
   - Optional: **Show raw events** if they want `eventType` soup. Default view is English.
4. If they ask “what if we reject?” — Inject again (each click is a new event), click **Reject**. Completed, **no** “Remediation written”.

`?session=<id>` restores a session after refresh. Double-click on Inject is ignored while a request is in flight.

### Admin (`/admin`) — 60 seconds if they care about bindings

1. Catalog should list **Exception review** without pasting a JWT.
2. Point at the dashed flag: admin-only JSON **may** contain `binding`.
3. **Fetch stripped contract** → `GET /v1/workflows/exception-review/active`. Compare: no `binding` key. That is the IP story.
4. Optional: Preview is a dry-run (`{filters, derived}`), no tool write.
5. Renderer kit at the bottom is local smoke, not an operator session. Don’t linger.

### If the kernel is down

The rail says **Kernel is down** and tells you to start uvicorn from `runtime/` with `.env` (Supabase). It does **not** dump a CORS error. Swap keys is not the fix.

---

## 6. Architecture + threat model

```
ExceptionEvent ──► FastAPI :8000
                     ├─ NATS JetStream EXCEPTIONS / exceptions.received
                     │    (MemoryBus if NATS isn’t running — no Docker Desktop required)
                     ├─ DagEngine (stateless): logic runs, UI nodes halt
                     ├─ ToolGateway (allowlist + audit-first)
                     ├─ Postgres (Supabase): workflows, sessions, audit_events, remediations
                     ├─ Redis active-workflow cache (MemoryCache fallback)
                     └─ OTel: dag.node, queue.consume, tool.call
```

**Bindings leak.** The rules *are* the product. Active payload and session `currentNode.config` go through `strip_bindings`. Cache stores the public document. Admin JWT can read full definitions; runtime API keys cannot. Tests assert `binding` / `filter_bracket` / `query_token` are absent from GET active (and session snapshots).

**Tool IAM.** Clients cannot name tools. The DAG names an allowlisted `toolName`. Unknown tools are denied, audited, and produce no side effect. Remediation rows require `audit_event_id`.

**Replay.** Publish archives the previous published row per slug (partial unique index). Sessions store `workflowId` + `version`. Re-running `DagEngine.advance` against that version reconstructs the form.

**Authz split.** `X-API-Key` on `/v1/*`. JWT `role=admin` on `/admin/*`. Operator JWTs 403. Runtime keys cannot publish. Demo key `demo-runtime-key` is public on purpose for this interview; production injects keys via env / IAM.

**Rate limits.** 30/min on ingest and advance.

**What we did not pretend to harden.** Multi-tenant isolation, SSO, secrets rotation, a real IdP, and a deployed frontend. Say that if asked.

---

## 7. JD mapping (Staff AI Platform)

| JD-shaped bullet | Where to point |
|---|---|
| Production Python / FastAPI | `runtime/app/main.py`, `runtime/app/routes/*.py`, Dockerfile `0.0.0.0:8000` |
| Postgres + migrations | `runtime/app/models/entities.py`, Alembic `001_initial_schema.py`, hosted Supabase (not Docker Desktop) |
| Event-driven ingest | `POST /v1/events/exceptions` → NATS `exceptions.received` + in-process consume |
| HITL / governed action | UI node halt + approval_card + tool gateway |
| Observability | JSON logs with `trace_id`, OTel spans, `/health` vs `/ready` |
| Infra as code | `infra/terraform`, `infra/k8s`, kind notes — probes wrap `/health` + `/ready` |
| Tests as contract | `pytest -q` in `runtime/` (SQLite in-memory; `TESTING=1` is tests only) |

Talk sequence: Addison is pull; the hard problem is action with oversight; UI-as-node + stripped bindings + audit-first tools; same kernel, different JSON, hosts reporting sign-off or client-prep without a new frontend.

---

## 8. Likely questions — answer without overselling

**“Is this Addison?”**  
No. Addison answers questions. This is what an Addison-class agent would *call* when a write needs a human and an audit trail.

**“Did you build this at Addepar?”**  
No. I built the primitives in a production SDUI + DAG stack (ThisVersus / ivt-mvp), then rewrote them in Python as a kernel aimed at this JD.

**“Why Python if the original was TypeScript?”**  
The JD is FastAPI / Postgres / events. The interesting contract is language-agnostic; rewriting it forced me to own the operational envelope, not paste a Node service.

**“Why not Temporal / Airflow / Step Functions?”**  
Those are great at durable jobs. The product-shaped problem here is **server-driven UI as a first-class halt**, with bindings that must not ship to the browser, and tool writes that are compliance-visible. You can sit this kernel *on* a durable orchestrator later; the demo is the contract, not a vendor bake-off.

**“Where does the LLM go?”**  
Optional, behind a tool node, after the human halt — never as the thing that writes the books. This demo deliberately has no model in the loop so the platform story isn’t “we wrapped GPT.”

**“How would you productionize?”**  
SSO / per-tenant API keys, not a public demo JWT in the client; NATS + Redis as real deps (the in-process adapters are a laptop fallback); OTel collector required; workflow linter in CI; bind tool IAM to the operator’s entitlements; don’t put bindings in Redis even encrypted if you can avoid it.

**“Show me a test.”**  
`test_bindings_stripped.py` (rules don’t leak) and `test_dag_halt_resume.py` (halt → accept → `remediation.written` with `auditEventId`; reject has no remediation).

**“What about scale?”**  
Engine is stateless; sessions are rows; ingest is idempotent on event fingerprint; rate-limited write paths. I have not load-tested this slice — don’t invent numbers.

---

## 9. What NOT to say

- “It’s like Addison but…” / “I built Addison.”
- “We used Gemini to recommend products…” (ThisVersus storefront).
- Anything about scrapers, crawling, or the e-commerce catalog.
- “This is in production at Addepar” or “this is deployed on Vercel.” It isn’t. Local demo + infra charts.
- “The frontend computes the delta.” It does not. If you catch yourself saying that, stop and point at **Server-derived**.
- “Just open Credentials.” A hiring manager should never need that panel. It exists to *swap* keys.
- Don’t pivot into RAG, cover-letter origin stories, or a fake Addepar UI.

Stop when the audit trail has made the point. Same kernel, different definition JSON, hosts the next vertical.

---

## Cheat sheet

| Thing | Value |
|---|---|
| Web | http://127.0.0.1:5173 |
| API | http://127.0.0.1:8000 (`/health`, `/ready`) |
| Runtime key | `demo-runtime-key` (preloaded) |
| Admin JWT | Preloaded; matches `JWT_SECRET=dev-jwt-secret-change-me` |
| Fixture | A-100 / US0378331005 / book 10000 vs custodian 9850 |
| Primary buttons | **Inject mismatch** → **Accept adjustment** |
| Seed (if empty DB) | `cd runtime && source .venv/bin/activate && python -m app.seed` |
| Tests | `cd runtime && pytest -q` |
| Mapping table | [`addepar-mapping.md`](addepar-mapping.md) |
| Kernel README | [`../runtime/README.md`](../runtime/README.md) |
