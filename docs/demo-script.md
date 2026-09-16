# Demo script — governed HITL runtime

Not a chatbot. Not Addison. A **versioned, server-driven workflow kernel** that turns an exception event into a halt-on-UI DAG, a human decision, a permissioned write, and an audit trail.

**Read first:** [`interview-briefing.md`](interview-briefing.md). Prereq: API on `localhost:8000`, UI on `http://127.0.0.1:5173`. Do **not** open **Swap keys** — `demo-runtime-key` and a demo admin JWT are preloaded.

---

## 90-second talk track

“You already ship Addison for permission-aware Q&A. The gap on a data-ops / agent roadmap is **action with oversight** — repeatable steps, a human in the loop, tools that cannot write silently, and replay when someone asks *why did this form look like that*.

I extracted the platform primitives from a production SDUI + DAG stack I already built — bindings never leave the server, UI nodes halt a stateless engine, sessions live in Postgres — and rewrote them in Python as a kernel an Addison-class agent would *call*.

The live slice is book-vs-custodian exception review. An event hits the kernel, the DAG computes a delta and citations **on the server**, this page only renders an approval card, and **Accept adjustment** goes through a tool gateway that **cannot persist a remediation without an audit row**. Versions are immutable. Operators cannot publish. That’s the Staff-shaped platform story, not a wealth chatbot.”

---

## 8-minute live demo

Prefer the UI. Keep curl in a second terminal if they want the contract.

### 0:00–0:45 — Frame it

Open `/` at `http://127.0.0.1:5173`. Say: kernel, not product clone. Point at the three thesis lines (event in / DAG on the server / you decide) and “not Addison” in the rail. Vertical is exception review because it matches a previewed data-ops agent — as the substrate, not a competing app.

### 0:45–1:15 — Process is alive

Rail: **Kernel reachable**. Optional curl:

```bash
curl -s localhost:8000/health      # {status: ok}
curl -s localhost:8000/ready       # postgres + redis + nats
```

Point at Dockerfile `HEALTHCHECK` and `/ready` as what k8s probes wrap.

### 1:15–2:30 — Bindings never leave the server

`/admin` (still no Credentials). Catalog should show **Exception review**. Click **Fetch stripped contract**. Say: `GET /v1/workflows/exception-review/active` has artifact configs, **no `binding`**. The admin JSON on the left may contain `filter_value` — that is admin-only. “The client is a renderer. The rules are IP.”

Optional curl:

```bash
curl -s -H "X-API-Key: demo-runtime-key" \
  localhost:8000/v1/workflows/exception-review/active | jq
```

Optional: Preview with `{"inputs":{"decision":"accept_adjustment"}}` → `{filters, derived}` dry-run, no tool write.

### 2:30–5:00 — Event → DAG halt

Back to **Operator**. Click **Inject mismatch**. Call out:

- Banner: event ingested, DAG ran, halted on the approval card; **you are the human in the loop**
- Status pill: **Waiting on you**
- Card: **Book vs custodian mismatch** / kicker **Human decision**
- Card facts and the right-rail **Server-derived** `delta` — server math, not client math
- **Citations · server-derived** (book ledger + custodian feed)
- Audit: “Event ingested”, “DAG halted for a human”
- Session `workflowId` + `version` (replay key)

Same POST publishes `exceptions.received` on stream `EXCEPTIONS` (in-process bus if NATS isn’t up). Do not walk a chat transcript.

### 5:00–6:30 — Approve, then prove the audit

Click **Accept adjustment**.

- Status: **Completed**
- Banner: remediation cannot exist without an audit row
- Audit English: human decision → `write_remediation` invoked → **Remediation written**
- Optional: **Show raw events** for `tool.invoked` / `remediation.written` + `auditEventId`

Line: “The remediations table has a hard FK to audit. There is no code path that writes the books without a row you can put in front of compliance.”

If time: **Inject mismatch** again, click **Reject** — completed, **no** “Remediation written”.

### 6:30–7:30 — Traces + IAM

- Logs: JSON lines with `trace_id` / `span_id`.
- Collector/Jaeger: spans `dag.node`, `queue.consume`, `tool.call`.
- Auth: Swap keys is how you’d *change* a token, not how the demo starts. Operator JWT against `/admin/workflows` → 403. Runtime key against `/admin/workflows` → 401.

### 7:30–8:00 — Close

“Same kernel, different definition JSON, hosts reporting sign-off or client-prep. No new frontend. Addison stays the conversational product. This is the governed action plane underneath.”

Stop. Do not pivot into RAG or a cover-letter origin story.

---

## Fail-closed checklist (if something is down)

| Symptom | Fix |
|---|---|
| Rail: **Kernel is down** | `cd runtime && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000` with `.env` (Supabase). Do **not** set `TESTING=1`. |
| `/ready` 503 postgres | Check `DATABASE_URL` (session-mode pooler `:5432`). Redis/NATS may stay in-process. |
| No published workflow | `python -m app.seed` |
| 401 on `/v1` | Should not happen; **Restore demo defaults** under Swap keys if someone blanked the key |
| 403 on `/admin` | token `role` must be `admin`; Restore demo defaults (matches `.env.example` `JWT_SECRET`) |
| Approve does nothing | body must be `{inputs:{decision:"accept_adjustment"}}` matching `questionId` — the **Accept adjustment** button already posts that |

## What not to say

- “It’s like Addison but…”
- “We used Gemini to recommend products…”
- Anything about scrapers or the ThisVersus storefront
- “Open Credentials first” — a hiring manager should never need that panel
