locals {
  # Interface that matches an EKS VPC module: callers should depend on these
  # outputs, not on kind internals. Values are stable placeholders.
  vpc_id                    = "vpc-kind-${var.cluster_name}"
  igw_id                    = "igw-kind-${var.cluster_name}"
  nat_gateway_ids           = [for az in var.azs : "nat-kind-${az}"]
  private_subnet_ids        = [for az in var.azs : "subnet-kind-private-${az}"]
  public_subnet_ids         = [for az in var.azs : "subnet-kind-public-${az}"]
  cluster_security_group_id = "sg-kind-cluster-${var.cluster_name}"
  node_security_group_id    = "sg-kind-nodes-${var.cluster_name}"
  pod_security_group_id     = "sg-kind-pods-${var.cluster_name}"

  overlay_notes = <<-EOT
    kind overlay (this environment)
    -------------------------------
    Control plane API: 127.0.0.1 (kind extra API-server bind).
    Node network: Docker bridge + kindnet CNI, not an AWS VPC.
    Pod CIDR: ${var.pod_cidr}
    Service CIDR: ${var.service_cidr}
    "VPC CIDR" advertised to other modules: ${var.vpc_cidr} (documentation only).
    There is no NAT Gateway, IGW, or route table — egress is the host Docker network.

    EKS equivalent (do not apply from this module)
    ----------------------------------------------
    aws_vpc + public/private aws_subnet across AZs
    aws_internet_gateway on public subnets
    aws_nat_gateway (typically one per AZ) for private-subnet egress
    aws_route_table / aws_route_table_association
    aws_security_group for cluster ENIs, nodes, and (optional) pod SGs
    aws_eks_cluster.vpc_config.subnet_ids = private_subnet_ids (or public+private)
    AWS VPC CNI (aws-k8s-cni) with prefix delegation instead of kindnet
  EOT
}

resource "kubernetes_namespace" "this" {
  metadata {
    name = var.namespace

    labels = {
      "app.kubernetes.io/part-of"    = "hitl-runtime"
      "app.kubernetes.io/managed-by" = "terraform"
      "addepar.dev/env"              = var.environment
      "addepar.dev/cluster"          = var.cluster_name
    }
  }
}

resource "kubernetes_config_map" "overlay" {
  metadata {
    name      = "kind-network-overlay"
    namespace = kubernetes_namespace.this.metadata[0].name

    labels = {
      "app.kubernetes.io/name"       = "kind-network-overlay"
      "app.kubernetes.io/component"  = "network"
      "app.kubernetes.io/part-of"    = "hitl-runtime"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }

  data = {
    cluster_name              = var.cluster_name
    environment               = var.environment
    vpc_id                    = local.vpc_id
    vpc_cidr                  = var.vpc_cidr
    pod_cidr                  = var.pod_cidr
    service_cidr              = var.service_cidr
    igw_id                    = local.igw_id
    nat_gateway_ids           = join(",", local.nat_gateway_ids)
    private_subnet_ids        = join(",", local.private_subnet_ids)
    public_subnet_ids         = join(",", local.public_subnet_ids)
    cluster_security_group_id = local.cluster_security_group_id
    node_security_group_id    = local.node_security_group_id
    pod_security_group_id     = local.pod_security_group_id
    overlay_notes             = local.overlay_notes
  }
}
