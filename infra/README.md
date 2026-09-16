# Platform envelope (kind + Terraform + observability)

Governed HITL runtime **operations layer**: Kubernetes on a laptop, Terraform modules that tell the EKS story, OTel → Jaeger/Prometheus, CI that fmts and validates the lot.

The FastAPI kernel and SDUI client live under `runtime/` (other workstreams). This directory does not contain application code.

## Quick path

```bash
# 1. Cluster
kind create cluster --config infra/kind/cluster.yaml
export KUBE_CONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"

# 2a. Raw manifests
kubectl apply -f infra/k8s/
# or: kubectl apply -k infra/k8s/

# 2b. Same shape via Terraform
cd infra/terraform/environments/dev
terraform init
terraform apply

# 3. App images (runtime/Dockerfile and web/Dockerfile)
docker build -t hitl-runtime-api:dev runtime/
docker build --build-arg VITE_API_URL=http://localhost:8000 -t hitl-runtime-web:dev web/
kind load docker-image hitl-runtime-api:dev --name hitl-runtime
kind load docker-image hitl-runtime-web:dev --name hitl-runtime
```

Until those images are loaded, `api` and `frontend` pods stay `ImagePullBackOff` / not Ready. Postgres, Redis, NATS, collector, Jaeger, and Prometheus should still come up.

Build the frontend with **`VITE_API_URL=http://localhost:8000`**. Vite bakes that URL into the static bundle. `http://api:8000` is in-cluster DNS and is not reachable from the browser. Demo path: port-forward both `svc/frontend 3000` and `svc/api 8000`.

## Port-forwards

Services are ClusterIP (EKS-like). After the data plane is Ready:

```bash
kubectl -n hitl port-forward svc/frontend 3000:3000          # SDUI client
kubectl -n hitl port-forward svc/api 8000:8000                # FastAPI  /health  /ready
kubectl -n hitl port-forward svc/jaeger 16686:16686           # traces
kubectl -n hitl port-forward svc/prometheus 9090:9090         # metrics
kubectl -n hitl port-forward svc/otel-collector 4317:4317 4318:4318
```

| UI | Port | URL |
|---|---|---|
| Frontend | 3000 | http://localhost:3000 |
| API | 8000 | http://localhost:8000/health |
| Jaeger | 16686 | http://localhost:16686 |
| Prometheus | 9090 | http://localhost:9090 |
| OTLP gRPC / HTTP | 4317 / 4318 | collector ingest |

Optional Grafana dashboard JSON (import into a Grafana with Prometheus uid `prometheus`): [`observability/grafana-dashboard.json`](observability/grafana-dashboard.json). Grafana is not deployed; Jaeger + Prometheus are enough for the demo.

## Compose overlay (no kind)

When the backend compose file exists:

```bash
docker compose -f runtime/docker-compose.yml -f infra/compose/observability.yml up
```

Standalone:

```bash
docker compose -f infra/compose/observability.yml up
```

Same host ports: Jaeger **16686**, Prometheus **9090**, OTLP **4317/4318**.

## Service contract (frozen)

| Thing | Value |
|---|---|
| API | container 8000, probes `GET /health` and `GET /ready` |
| Frontend | container 3000, nginx; bake `VITE_API_URL=http://localhost:8000` (not `API_URL` / not `http://api:8000`) |
| Env | `DATABASE_URL` (`postgresql+asyncpg://…`), `REDIS_URL`, `NATS_URL`, `JWT_SECRET`, `API_KEYS`, `OTEL_EXPORTER_OTLP_ENDPOINT` (HTTP `:4318`) |
| Data | `postgres:16`, `redis:7`, `nats:2.10` + JetStream |
| Telemetry | otel-collector, Jaeger, Prometheus |

Secrets in `infra/k8s/01-secrets.yaml` and the Terraform data module are **placeholders** (`changeme`, `replace-me-*`). Never commit real credentials. `terraform.tfstate*` is gitignored.

## How this maps to EKS

| Local (kind) | EKS |
|---|---|
| `kind create cluster` + Docker bridge / kindnet | `aws_eks_cluster` + `aws_eks_node_group` in private subnets |
| Dummy VPC outputs on ConfigMap `kind-network-overlay` | `aws_vpc`, public/private `aws_subnet`, IGW, NAT, cluster SG |
| `kubernetes_secret` placeholders | Secrets Manager + CSI / External Secrets |
| API ServiceAccount annotation stub | **IRSA** (`eks.amazonaws.com/role-arn`) |
| In-cluster Postgres / Redis / NATS | **RDS** Postgres 16, **ElastiCache** Redis 7, **MSK** or NATS Helm |
| contrib collector + Jaeger + Prometheus | **ADOT** add-on, X-Ray or self-hosted Jaeger, **AMP** + Managed Grafana |
| `kubectl port-forward` / optional NodePort | Internal ALB (aws-load-balancer-controller Helm chart) |
| HPA stub | Same HPA object + metrics-server add-on / Karpenter for nodes |

Module READMEs expand each row with sketch `aws_*` resources:

- [`terraform/modules/network/README.md`](terraform/modules/network/README.md)
- [`terraform/modules/k8s/README.md`](terraform/modules/k8s/README.md)
- [`terraform/modules/data/README.md`](terraform/modules/data/README.md)
- [`terraform/modules/observability/README.md`](terraform/modules/observability/README.md)

Terraform providers are **kubernetes + helm only**, pointed at kind via `KUBE_CONFIG_PATH`. There is no AWS provider and no live AWS account requirement.

## Layout

```
infra/
  kind/                 cluster.yaml — kind create cluster
  k8s/                  raw apply-able manifests
  terraform/
    modules/{network,k8s,data,observability}/
    environments/dev/   terraform apply (kind)
  observability/        collector config, prometheus.yml, Grafana JSON
  compose/              observability.yml overlay
```

## Tear down

```bash
kubectl delete -f infra/k8s/ --ignore-not-found
# or, from environments/dev: terraform destroy
kind delete cluster --name hitl-runtime
```
