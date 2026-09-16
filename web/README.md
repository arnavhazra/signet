# Signet (web)

Thin **server-driven UI** client for the governed HITL workflow kernel. The browser is a renderer: it paints artifact payloads and posts answers. It does not compute exception deltas, apply brackets, or evaluate bindings.

App title: **Signet** — *Governed HITL workflow kernel*. Not Addison.

## Run locally

```bash
cd web
npm install
npm run dev
```

Vite serves the app at [http://127.0.0.1:5173](http://127.0.0.1:5173) and **proxies** `/v1`, `/health`, `/ready`, and `/admin/workflows` to `http://127.0.0.1:8000`. You should not see CORS errors in the hiring-manager path.

The public demo runtime key (`demo-runtime-key`) and a demo admin JWT are seeded into localStorage on first load. **Do not open Swap keys** for the default loop. That drawer is only for swapping credentials.

Then: **Inject mismatch** → **Accept adjustment** → audit trail. `/admin` lists workflows with the demo JWT.

## Routes

| Path | Screen |
| --- | --- |
| `/` | Operator — inject synthetic exception, render `currentNode`, server-derived facts/citations, human-readable audit |
| `/admin` | Admin — load/create workflow JSON, preview inputs, publish; bindings are admin-only and stripped from GET `/v1/workflows/:slug/active` |

Query params: `/?session=<id>`, `/admin?workflow=<id>`.

## Environment

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Orchestrator base URL for production builds. **Leave unset in Vite dev** (proxy). |
| `VITE_API_KEY` | Optional override of `demo-runtime-key` |
| `VITE_DEMO_ADMIN_JWT` | Optional override of the demo admin JWT |

Production would inject keys via env / IdP. Hardcoding the public demo key in this client is interview-demo only.

## Docker (nginx, port 3000)

```bash
cd web
docker build --build-arg VITE_API_URL=http://localhost:8000 -t hitl-runtime-web:dev .
docker run --rm -p 3000:3000 hitl-runtime-web:dev
```

## Frozen API used by this client

Runtime (`X-API-Key`):

- `GET /health`
- `GET /v1/workflows/{slug}/active`
- `POST /v1/events/exceptions` `{ accountId, securityId, bookQty, custodianQty, asOf, source }`
- `GET /v1/sessions/{id}`
- `POST /v1/sessions/{id}/advance` `{ inputs: { [questionId]: value } }`
- `GET /v1/sessions/{id}/audit`

Admin (`Authorization: Bearer`):

- `GET/POST /admin/workflows`
- `GET /admin/workflows/{id}`
- `POST /admin/workflows/{id}/preview` `{ inputs }`
- `POST /admin/workflows/{id}/publish`

Operator **Inject mismatch** posts account `A-100`, security `US0378331005`, and unequal `bookQty` / `custodianQty`. The client never subtracts them. Each inject uses a unique `source` so a completed session does not block a new demo loop.

## Renderer contract

Artifact components (`choice_cards`, `toggle`, `numeric_input`, `approval_card`) read presentation keys from `config` (`options`, `fields`/`facts`, `actions`, labels, numeric min/max/unit). They ignore `binding`, `bindings`, `filter_value`, `filter_bracket`, and `query_token`. The admin JSON editor may show bindings; the operator view does not dump `config`. Delta and citations are labeled **server-derived**.
