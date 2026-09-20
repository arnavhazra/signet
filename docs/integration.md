# Integrating an agent with Signet

The Addison / data-ops agent keeps proposing. It does not become a workflow engine. Reads stay autonomous. Writes return an approval URL. Humans finish the DAG. The trail records which agent asked next to which humans approved.

Signet is the governed action layer that agent calls when an exception needs a human and an audit trail. Signet does not answer portfolio questions and does not write silently.

Live console: [https://signet-pearl-iota.vercel.app/agent](https://signet-pearl-iota.vercel.app/agent). Contract summary: [README — Agent integration](../README.md#agent-integration).

## Wire-up

Two equivalent doors. Pick one.

### MCP (Streamable HTTP)

Point a Supervisor-class agent (or any MCP client) at `/mcp`. On the public demo, auth is the visitor JWT (`accessToken`) from `GET /v1/auth/demo` as `Authorization: Bearer`, or the HttpOnly demo cookie. Do not send `X-API-Key: demo-runtime-key` on the public origin.

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

| Tool | On their side | On Signet |
| --- | --- | --- |
| `list_exceptions` | Agent lists open breaks for the caller’s org | Read. Served. Audited as `agent.proposed`. |
| `propose_remediation` | Agent asks to fix a break | Write. Policy returns `requires_human` plus `approvalUrl`. No remediation yet. |
| `get_session` | Agent (or ops UI) checks whether humans have moved | Snapshot; bindings stripped. |
| `get_audit` | Agent or compliance reads the trail | Includes `agent.proposed` / `agent.denied`, human decisions, `remediation.written`. |

Resource `signet://inbox` (`resources/list` / `resources/read`) is the same inbox payload as `list_exceptions`.

Unknown tools are denied, audited, and have no side effect — the same posture as the HTTP allowlist.

### HTTP

```
POST /v1/agent/propose
Authorization: Bearer <accessToken from GET /v1/auth/demo>
{
  "intent": "resolve_break",
  "accountId": "A-214",
  "params": {},
  "rationale": "Book vs custodian delta exceeds threshold"
}
```

`text` may replace `intent` (free language). Optional: `accountId`, `params`, `rationale`.

```
{
  "decision": "requires_human" | "auto_executed" | "denied",
  "policy": { "rule": "write_class_requires_human", "threshold": 100, "delta": 120 },
  "sessionId": "...",
  "approvalUrl": "/sessions/...",
  "auditEventId": "...",
  "proposal": { "intent": "resolve_break", "accountId": "A-214" }
}
```

```bash
TOKEN=$(curl -sS -c cookies -b cookies \
  'https://signet-pearl-iota.vercel.app/v1/auth/demo?role=operator' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')

curl -s -X POST https://signet-pearl-iota.vercel.app/v1/agent/propose \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"intent":"resolve_break","accountId":"A-214","rationale":"Delta exceeds threshold"}'
```

`propose_remediation` on MCP is this POST with a write-class intent.

## Handle `approvalUrl`

On `requires_human`, the write has **not** landed. There is no `remediation.written` yet.

1. Surface `approvalUrl` to ops, or poll `get_session`, until humans complete the DAG.
2. Do not treat the proposal response as a posted mutation.
3. Do not retry the same write under a different tool name. Policy will still require a human.
4. After checker approval, `get_audit` shows `agent.proposed`, two human decisions, `tool.invoked`, and `remediation.written`.

The agent proposed. Humans approved. The tool gateway wrote.

## Policy (server-side, not in the prompt)

| Class | Intents | Decision | Side effect |
| --- | --- | --- | --- |
| Write | `resolve_break`, `adjust_position` | `requires_human` | Opens a HITL session on the existing exception-review DAG. Agent receives `approvalUrl`, not a completed write. Audit: `agent.proposed`. |
| Read | `list_exceptions`, `explain_break` | `auto_executed` | Data returned. Still audited (`agent.proposed`). |
| Unknown | anything else (including `delete_everything`) | `denied` | `agent.denied`. No session, no remediation. |

Same three calls as canned chips on `/agent`.

Humans still run maker-checker on large deltas. The agent is a proposer in that trail, not a second writer.

Free text is parsed into the same typed proposal: a model when `LLM_API_KEY` is set (Vercel AI Gateway or OpenAI-compatible), otherwise a deterministic parser. Policy always classifies the typed intent, never the prose. The live URL does not require a model.

## Checker node

High-delta sessions halt on `checker_approval` (any node id that is `checker*` counts). Advancing that node requires the `checker` or `admin` role. An operator who skips the role switch receives `403`. Dual control is a second human, not a second click by the same principal.

The data-ops agent does not implement a second maker-checker of its own. Signet’s DAG is the dual-control rule; the tool gateway is the only writer.

## Databricks / Unity Catalog stay out of the DAG

Do not put Unity Catalog, lakehouse queries, or Databricks jobs inside the DAG engine. Signet is ingress, halt, and audited write.

- **Ingress:** a job, bus, or ADX-class producer POSTs an exception event (`account`, CUSIP, book, custodian, as-of) to `POST /v1/events/exceptions`, or Signet consumes a table later. Databricks is not a node type.
- **Citations:** `attach_citations` is synthetic in the demo. Later that tool can fetch warehouse / UC record ids **on the server**, still after the human halt, still with the operator’s entitlements.
- **Writes:** `write_remediation` calls an allowlisted mutation API (or a governed Databricks write) **after** the audit row. `remediations.audit_event_id` stays a required FK.
- **Serving:** Addison keeps pull Q&A on Databricks / UC. Signet stays the HITL action plane.

You add a tool node and an event schema. You do not fold UC into the workflow runner.

## What changes on their side

Keep the existing conversational agent. Do not route household or portfolio Q&A through Signet.

1. Register Signet as an MCP server, or call `POST /v1/agent/propose` from the agent’s tool layer.
2. Map “list breaks” / “explain this break” to read-class tools. Those calls may stay autonomous; they are audited.
3. Map “fix this break” / “adjust the position” to `propose_remediation` (or `intent: resolve_break` / `adjust_position`). **Stop calling a mutation API from the agent.**
4. On `requires_human`, handle `approvalUrl`. Do not assume the write landed.
5. On `denied`, stop. Do not retry under a different tool name to bypass policy.
6. Do not implement a second maker-checker inside the agent. Dual control is Signet’s DAG; the checker node is role-gated.
7. When compliance asks who asked, point at `agent.proposed` / `agent.denied` (rationale plus agent identity) next to the human decisions and `remediation.written`.

## What Signet does not do

- **No portfolio or household Q&A.** That stays on the conversational agent. Signet will not answer “what’s in this account?”
- **No silent writes.** An agent cannot `write_remediation` by naming a tool. Clients cannot name tools; the DAG does, after humans advance the session.
- **No books-of-record or custodian feeds.** Demo data is synthetic book-vs-custodian. Production would attach an allowlisted mutation API behind the same audit FK.
- **No Unity Catalog inside the DAG.** Ingress and citations later; UC stays the serving/governance plane for pull Q&A.
- **No replacement for the agent’s planner or entitlements.** Signet authorizes *actions* (propose / halt / audited write), not which households the model may discuss.
- **No policy-in-the-prompt.** Intent class lives in the kernel. A jailbroken transcript cannot reclassify a write as a read.

## Auth and demo

Runtime routes (`/v1/*`, `/mcp`) on the public demo accept the HttpOnly `signet_demo` cookie or `Authorization: Bearer` with `accessToken` from `GET /v1/auth/demo`. Auditor is GET-only. Operator and checker may propose. Advancing `checker_approval` requires `checker` or `admin`. API keys are for local/`TESTING` only; they do not authenticate the public origin.

The public demo mints a per-visitor `org_id` so a cold link is an empty-of-other-people inbox. `POST /v1/demo/reset` reseeds that visitor only.

Local: API on `:8000`, Vite on `:5173` proxying `/v1` and `/mcp`. Spec: `/openapi.json`, `/docs`.
