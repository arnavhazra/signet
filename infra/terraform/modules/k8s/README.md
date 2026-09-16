# k8s module (API + frontend)

Deployments, Services, probes, resource requests/limits, a canary annotation on the API, and an HPA stub. The API Service name is **`api`** so the frontend can use `http://api:8000` unchanged.

## What this module applies locally

| Workload | Port | Probes | Resources (req/limit) |
|---|---|---|---|
| `api` | 8000 | `GET /health` live, `GET /ready` ready | 100m/256Mi → 500m/512Mi |
| `frontend` | 3000 | TCP 3000 | 50m/64Mi → 250m/256Mi |
| `api` HPA | — | CPU 70% → 1–3 replicas | stub; needs metrics-server |

API pod annotations:

- `addepar.dev/canary=false` (flip to `"true"` for a canary ReplicaSet/Deployment overlay)
- `prometheus.io/scrape=true`, `prometheus.io/port=8000`, `prometheus.io/path=/metrics`

`wait_for_rollout` defaults to **false** so `terraform apply` against kind succeeds before the API/frontend images exist. Load images with `kind load docker-image ... --name hitl-runtime`, then optionally set `wait_for_rollout=true`.

Env injected into the API (from `runtime-secrets` + explicit OTEL):

`DATABASE_URL`, `REDIS_URL`, `NATS_URL`, `JWT_SECRET`, `API_KEYS`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

Frontend: runtime env `API_URL=http://api:8000` is unused by nginx. Bake `VITE_API_URL=http://localhost:8000` into `hitl-runtime-web:dev` (from `web/Dockerfile`) and port-forward `svc/api 8000` plus `svc/frontend 3000`. OTEL HTTP endpoint `:4318` (the API uses the HTTP exporter; gRPC is `:4317`).

## EKS equivalent (interview story — do not apply here)

### Cluster + node group

```hcl
resource "aws_eks_cluster" "this" { /* see network module */ }

resource "aws_eks_node_group" "apps" {
  cluster_name    = aws_eks_cluster.this.name
  subnet_ids      = var.private_subnet_ids
  instance_types  = ["m6i.large"]
  scaling_config {
    desired_size = 2
    min_size     = 2
    max_size     = 6
  }
}
```

### IRSA (replaces a static JWT/API-key secret for AWS APIs)

```hcl
resource "aws_iam_openid_connect_provider" "eks" { /* from cluster OIDC issuer */ }

resource "aws_iam_role" "api" {
  name               = "${var.cluster_name}-api"
  assume_role_policy = data.aws_iam_policy_document.api_irsa.json
}

# kubernetes_service_account.api annotation:
# eks.amazonaws.com/role-arn = aws_iam_role.api.arn
```

Pass `api_irsa_role_arn` into this module on EKS. The role's policy is `secretsmanager:GetSecretValue` (and nothing else by default — tool IAM is a separate role per gateway).

### Ingress / ALB instead of port-forward

```hcl
resource "helm_release" "aws_load_balancer_controller" { /* IRSA + helm */ }

# Ingress annotation: alb.ingress.kubernetes.io/scheme = internal
# Target: frontend:3000; API stays ClusterIP (only the UI is public/private-ALB).
```

### HPA on EKS

Install the `metrics-server` add-on (or CloudWatch/AMP adapter). The HPA object in this module is already `autoscaling/v2` and does not need to change. Cluster Autoscaler / Karpenter covers nodes; HPA covers pods.

### Canary

The `addepar.dev/canary` annotation is the hook for Argo Rollouts / Flagger / a second Deployment `api-canary` with a weighted Service. On EKS the same annotation is what a progressive-delivery controller watches — not a custom sidecar.

### Pod Security / resources

EKS should enforce a restricted Pod Security Standard. Requests/limits here are the same numbers you would ship; they also keep the kind node from starving during the demo.
