# Signet (web)

Thin **server-driven UI** client. Package name `signet-web`. The browser paints artifact payloads and posts answers. It does not compute exception deltas, apply brackets, or evaluate bindings.

## Run locally

```bash
cd web
npm install
npm run dev
```

Vite serves [http://127.0.0.1:5173](http://127.0.0.1:5173) and proxies `/v1`, `/health`, `/ready`, `/mcp`, and `/admin/workflows` to `http://127.0.0.1:8000`. Production builds use same origin (`VITE_API_URL` empty); Vercel rewrites those paths to FastAPI.

`GET /v1/auth/demo` sets the HttpOnly demo cookie. Marketing routes (`/`, `/pricing`) do not mint it. Opening `/inbox` starts the demo session. The SPA does not send `X-API-Key` or a baked admin JWT.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing — governed action kernel; Open console |
| `/pricing` | Get in touch — mailto contact only |
| `/inbox` | Inbox — queue of exceptions; click a row |
| `/sessions/:id` | Decision — SDUI renderer, citations, audit, accept / reject / more data / checker |
| `/sessions/:id/replay` | Stored `workflowId` + `version`, stripped contract, citations |
| `/agent` | Propose — canned Write / Read / Deny chips, verdict, curl + MCP contract |
| `/audit` | Read-only search with agent / human / remediation filters |
| `/admin` | Shared catalog, lint, fetch stripped contract (demo cookie role `admin`) |
| `/settings` | Profile, simulated billing, usage, reset |

Nav (console): Inbox, Agent, Audit, Admin, Settings. No sign-in gate.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API origin for production builds. Leave unset in Vite dev (proxy) and on Vercel (same origin). |
| `VITE_API_KEY` | Unused by fetches. Optional local override only. |

## Frozen API used by this client

- `GET /health`
- `GET /ready`
- `GET /v1/auth/demo` (JSON includes `accessToken` for MCP; cookie stays HttpOnly)
- `GET /v1/auth/me`
- `GET /v1/inbox`
- `POST /v1/events/exceptions`
- `GET /v1/sessions/{id}`
- `POST /v1/sessions/{id}/advance` `{ inputs, expectedUpdatedAt? }`
- `GET /v1/sessions/{id}/audit`
- `GET /v1/sessions/{id}/replay`
- `GET /v1/audit`
- `POST /v1/agent/propose`
- `POST /v1/demo/reset`
- `POST /v1/demo/account` `{ email, orgName, plan? }`
- `POST /v1/demo/account/confirm` `{ token }`
- `GET /v1/demo/account`
- `GET /v1/demo/usage`
- `GET /v1/workflows/{slug}/active`
- `GET/POST /admin/workflows`, `GET /admin/workflows/{id}`, preview, publish

`409 CONFLICT` on stale advance. Auditor `403` on writes. Checker node `403` for operator. Show `X-Request-Id` on the session panel.

## Renderer contract

Artifact components (`choice_cards`, `toggle`, `numeric_input`, `approval_card`) read presentation keys from `config` (`options`, `fields`/`facts`, `actions`, labels, numeric min/max/unit). They ignore `binding`, `bindings`, `filter_value`, `filter_bracket`, and `query_token`. Delta and citations are server-derived.

## Tests

```bash
npm run test:e2e
npm run test:e2e:prod   # https://signet-pearl-iota.vercel.app
```

Local Playwright boots `TESTING=1` uvicorn (SQLite, `API_KEYS=demo-runtime-key`) plus `vite preview`. Production uses the demo cookie; do not send `X-API-Key`.
