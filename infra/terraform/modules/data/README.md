# Data module (Postgres, Redis, NATS JetStream)

In-cluster datastores for kind. Secrets are **placeholders** (`changeme`, `replace-me-*`) so `terraform apply` works without a live secret store. Do not put real credentials in tfvars that get committed.

## What this module applies locally

| Workload | Image | Service DNS | Probe |
|---|---|---|---|
| Postgres | `postgres:16-alpine` | `postgres:5432` | `pg_isready` |
| Redis | `redis:7-alpine` | `redis:6379` | `redis-cli ping` |
| NATS | `nats:2.10-alpine` | `nats:4222` (+ `:8222` monitor) | `GET /healthz` |
| Secrets | `postgres-auth`, `runtime-secrets` | consumed by the k8s module | n/a |

NATS is started with JetStream (`store_dir=/data`). Persistence is `emptyDir` — fine for a laptop demo, not for prod.

Helm is **configured at the root module** (`hashicorp/helm` via `KUBE_CONFIG_PATH`) so this folder can grow a `helm_release` (Bitnami Postgres, NATS.io chart) without changing providers. The applied path is native `kubernetes_*` resources so `terraform validate` does not need a chart repo.

## Environment contract the API consumes

From `runtime-secrets`:

- `DATABASE_URL` — `postgresql+asyncpg://hitl:changeme@postgres:5432/hitl`
- `REDIS_URL` — `redis://redis:6379/0`
- `NATS_URL` — `nats://nats:4222`
- `JWT_SECRET`, `API_KEYS` — placeholders (`API_KEYS=demo-runtime-key` for the kind demo)

## EKS equivalent (interview story — do not apply here)

### Postgres → RDS

```hcl
resource "aws_db_subnet_group" "this" {
  subnet_ids = var.private_subnet_ids
}

resource "aws_db_instance" "hitl" {
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t4g.medium"
  db_subnet_group_name = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted    = true
  deletion_protection  = true
  # credentials from Secrets Manager, not terraform state
}
```

### Redis → ElastiCache

```hcl
resource "aws_elasticache_replication_group" "hitl" {
  engine             = "redis"
  engine_version     = "7"
  node_type          = "cache.t4g.small"
  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
```

### NATS → MSK or NATS on EKS

Two honest options:

1. **Amazon MSK** (Kafka) if the org standardizes on Kafka rather than NATS — same *role* (durable event bus), different protocol. The runtime would swap the JetStream consumer for a Kafka consumer.
2. **NATS JetStream on EKS** via the official Helm chart (`nats-io/nats`) with a `StatefulSet`, EBS PVCs, and an internal NLB. IRSA is unused (NATS has its own auth); still put the `NATS_URL` and credentials in Secrets Manager.

```hcl
# Option 2 sketch
resource "helm_release" "nats" {
  name       = "nats"
  repository = "https://nats-io.github.io/k8s/helm/charts"
  chart      = "nats"
  namespace  = var.namespace
  values = [
    yamlencode({
      config = { jetstream = { enabled = true } }
    })
  ]
}
```

### Secrets → AWS Secrets Manager + CSI

```hcl
resource "aws_secretsmanager_secret" "runtime" { name = "${var.cluster_name}/runtime" }

# External Secrets Operator or secrets-store-csi-driver
# ServiceAccount annotation: eks.amazonaws.com/role-arn = aws_iam_role.api.arn
# IAM policy: secretsmanager:GetSecretValue on that ARN (IRSA).
```

Locally the CSI driver is skipped; `kubernetes_secret` with placeholder `data` stands in for the same keys the API will read on EKS.
