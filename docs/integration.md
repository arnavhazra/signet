# Integrating an agent with Signet

Signet is the governed action layer an Addison-class agent calls when an exception needs a human and an audit trail. The agent keeps autonomy for reads. Writes are dual-control: the agent proposes, Signet opens a session, humans approve, the tool gateway writes and audits. Signet does not answer portfolio questions and does not write silently.

Live console: [https://signet-pearl-iota.vercel.app/agent](https://signet-pearl-iota.vercel.app/agent). Contract summary: [README — Agent integration](../README.md#agent-integration).

## Wire-up

Two equivalent doors. Pick one.

### MCP (Streamable HTTP)

Point the agent’s MCP client at `/mcp`. Auth is `X-API-Key`, Bearer JWT, or the demo cookie.

```json
{
  "mcpServers": {
    "signet": {
      "url": "https://signet-pearl-iota.vercel.app/mcp",
      "headers": {
        "X-API-Key": "demo-runtime-key"
      }
    }
  }
}
```

| Tool | On their side | On Signet |
| --- | --- | --- |
| `list_exceptions` | Agent lists open breaks for the caller’s org | Read. Served. Audited as `agent.proposed`. |
| `propose_remediation` | Agent asks to fix a break | Write. Policy returns `requires_human` plus an approval URL. No remediation yet. |
| `get_session` | Agent (or ops UI) checks whether humans have moved | Snapshot; bindings stripped. |
| `get_audit` | Agent or compliance reads the trail | Includes `agent.proposed` / `agent.denied`, human decisions, `remediation.written`. |

Unknown tools are denied, audited, and have no side effect — the same posture as the HTTP allowlist.

### HTTP

```
POST /v1/agent/propose
Authorization: X-API-Key or Bearer
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
curl -s -X POST https://signet-pearl-iota.vercel.app/v1/agent/propose \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-runtime-key" \
  -d '{"intent":"resolve_break","accountId":"A-214","rationale":"Delta exceeds threshold"}'
```

`propose_remediation` on MCP is this POST with a write-class intent.

## Policy (server-side, not in the prompt)

| Class | Intents | Decision | Side effect |
| --- | --- | --- | --- |
| Write | `resolve_break`, `adjust_position` | `requires_human` | Opens a HITL session on the existing exception-review DAG. Agent receives `approvalUrl`, not a completed write. Audit: `agent.proposed`. |
| Read | `list_exceptions`, `explain_break` | `auto_executed` | Data returned. Still audited (`agent.proposed`). |
| Unknown | anything else | `denied` | `agent.denied`. No session, no remediation. |

Humans still run maker-checker on large deltas. The agent is a proposer in that trail, not a second writer.

Free text is parsed into the same typed proposal: a model when `LLM_API_KEY` is set (Vercel AI Gateway or OpenAI-compatible), otherwise a deterministic parser. Policy always classifies the typed intent, never the prose. The live URL does not require a model.

## What changes on their side

Keep the existing conversational agent. Do not route household or portfolio Q&A through Signet.

1. Register Signet as an MCP server, or call `POST /v1/agent/propose` from the agent’s tool layer.
2. Map “list breaks” / “explain this break” to read-class tools. Those calls may stay autonomous; they are audited.
3. Map “fix this break” / “adjust the position” to `propose_remediation` (or `intent: resolve_break` / `adjust_position`). **Stop calling a mutation API from the agent.**
4. On `requires_human`, surface `approvalUrl` to ops (or poll `get_session`). Do not treat the proposal as a posted write.
5. On `denied`, stop. Do not retry under a different tool name to bypass policy.
6. Do not implement a second maker-checker inside the agent. Dual control is Signet’s DAG; the tool gateway is the only writer.
7. When compliance asks who asked, point at `agent.proposed` / `agent.denied` (rationale plus agent identity) next to the human decisions and `remediation.written`.

## What Signet does not do

- **No portfolio or household Q&A.** That stays on the conversational agent. Signet will not answer “what’s in this account?”
- **No silent writes.** An agent cannot `write_remediation` by naming a tool. Clients cannot name tools; the DAG does, after humans advance the session.
- **No books-of-record or custodian feeds.** Demo data is synthetic book-vs-custodian. Production would attach an allowlisted mutation API behind the same audit FK.
- **No replacement for the agent’s planner or entitlements.** Signet authorizes *actions* (propose / halt / audited write), not which households the model may discuss.
- **No policy-in-the-prompt.** Intent class lives in the kernel. A jailbroken transcript cannot reclassify a write as a read.

## Auth and demo

Runtime routes (`/v1/*`, `/mcp`) accept `X-API-Key`, Bearer JWT, or the HttpOnly `signet_demo` cookie from `GET /v1/auth/demo`. Auditor is GET-only. Operator and checker may propose.

The public demo mints a per-visitor `org_id` so a cold link is an empty-of-other-people inbox. `POST /v1/demo/reset` reseeds that visitor only.

Local: API on `:8000`, Vite on `:5173` proxying `/v1` and `/mcp`. Spec: `/openapi.json`, `/docs`.
