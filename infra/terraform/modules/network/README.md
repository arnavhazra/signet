# Network module (kind overlay)

Creates the `hitl` namespace and a ConfigMap that **advertises the same outputs an EKS VPC module would**: `vpc_id`, public/private subnet ids, cluster/node security groups, NAT gateway ids. On kind those values are dummy strings. Callers (data, k8s, observability) should wire off the outputs, not off Docker.

## What this module applies locally

| Resource | kind | Purpose |
|---|---|---|
| `kubernetes_namespace` | real | Isolation boundary (`hitl`) |
| `kubernetes_config_map.overlay` | real | Documents CIDRs + dummy VPC interface |
| Docker bridge + kindnet | host | Actual packet path; not modeled in Terraform |

Bring the cluster up first: `kind create cluster --config infra/kind/cluster.yaml`.

## Dummy VPC interface

Other modules can consume:

- `vpc_id`, `vpc_cidr`
- `private_subnet_ids`, `public_subnet_ids`
- `cluster_security_group_id`, `node_security_group_id`
- `nat_gateway_ids`

This keeps the **call site** identical if/when the root module is pointed at AWS providers.

## EKS equivalent (interview story — do not apply here)

```hcl
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "private" { /* one per AZ, no public IP, NAT route */ }
resource "aws_subnet" "public"  { /* one per AZ, map_public_ip, IGW route */ }

resource "aws_internet_gateway" "this" { vpc_id = aws_vpc.this.id }
resource "aws_nat_gateway" "this"      { /* EIP per AZ, public subnet */ }

resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  vpc_config {
    subnet_ids              = concat(aws_subnet.private[*].id, aws_subnet.public[*].id)
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.cluster.id]
  }
}
```

Also on EKS, not in this kind overlay:

- **VPC CNI** (`aws-k8s-cni`) instead of kindnet, usually with prefix delegation
- **Private-only API endpoint** plus a bastion or SSM for operators
- **Security groups for pods** (optional) instead of a flat CNI bridge
- **VPC endpoints** (`sts`, `ecr`, `logs`, Secrets Manager) so private nodes never need a wide-open NAT

Kind extraPortMappings ≈ public NLB/ALB listeners. Locally we prefer `kubectl port-forward` so the default Services stay ClusterIP, matching in-cluster EKS service topology.
