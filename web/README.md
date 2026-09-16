# Signet (web)

Thin **server-driven UI** client. The browser paints artifact payloads and posts answers. It does not compute exception deltas, apply brackets, or evaluate bindings.

## Run locally

```bash
cd web
npm install
npm run dev
```

Vite serves [http://127.0.0.1:5173](http://127.0.0.1:5173) and proxies `/v1`, `/health`, `/ready`, and `/admin/workflows` to `http://127.0.0.1:8000`. Production builds use same origin (`VITE_API_URL` empty); Vercel rewrites those paths to FastAPI.

`GET /v1/auth/demo` sets the operator cookie. `X-API-Key` remains a local fallback.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Inbox — queue of exceptions; click a row |
| `/sessions/:id` | Decision — SDUI renderer, citations, audit, accept / reject / more data / checker |
| `/sessions/:id/replay` | Stored `workflowId` + `version`, stripped contract, citations |
| `/audit` | Read-only search |
| `/admin` | Catalog, lint, fetch stripped contract |

Nav: Inbox, Audit, Admin.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API origin for production builds. Leave unset in Vite dev (proxy) and on Vercel (same origin). |
| `VITE_API_KEY` | Optional override of the local demo runtime key |

## Frozen API used by this client

- `GET /health`
- `GET /v1/auth/demo`
- `GET /v1/inbox`
- `POST /v1/events/exceptions`
- `GET /v1/sessions/{id}`
- `POST /v1/sessions/{id}/advance` `{ inputs, expectedUpdatedAt? }`
- `GET /v1/sessions/{id}/audit`
- `GET /v1/sessions/{id}/replay`
- `GET /v1/audit`
- `GET /v1/workflows/{slug}/active`
- `GET/POST /admin/workflows`, `GET /admin/workflows/{id}`, preview, publish

`409 CONFLICT` on stale advance. Auditor `403` on writes. Show `X-Request-Id` on the session panel.

## Renderer contract

Artifact components (`choice_cards`, `toggle`, `numeric_input`, `approval_card`) read presentation keys from `config` (`options`, `fields`/`facts`, `actions`, labels, numeric min/max/unit). They ignore `binding`, `bindings`, `filter_value`, `filter_bracket`, and `query_token`. Delta and citations are server-derived.

## Tests

```bash
npx playwright test
```

Inbox → high-delta maker-checker → audit trail → replay. Low-delta accept is a single step.
