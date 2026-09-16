# Dev environment — kind

Terraform root that targets a **local kind cluster**, not AWS. Providers: `hashicorp/kubernetes` and `hashicorp/helm`, both configured with `KUBE_CONFIG_PATH` (or `kube_config_path` / `kube_context`).

```bash
kind create cluster --config ../../../../kind/cluster.yaml   # from repo: infra/kind/cluster.yaml
export KUBE_CONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"
terraform init
terraform apply
```

`terraform validate` does not need a live cluster. `terraform apply` does.

## Modules

| Module | Local | EKS stand-in |
|---|---|---|
| `network` | namespace + dummy VPC outputs | `aws_vpc`, subnets, `aws_eks_cluster` |
| `data` | Postgres 16, Redis 7, NATS 2.10 JetStream | RDS, ElastiCache, MSK/NATS, Secrets Manager |
| `observability` | OTel collector, Prometheus, Jaeger | ADOT, AMP, X-Ray / Managed Grafana |
| `k8s` | api + frontend Deployments, probes, HPA stub | same manifests + IRSA + ALB |

## Why helm is configured but unused here

Helm is the EKS install path for aws-load-balancer-controller, metrics-server, NATS.io chart, and the ADOT operator. kind uses native `kubernetes_*` resources so CI `terraform validate` does not pull chart repos. Flip individual workloads to `helm_release` without changing `providers.tf`.
