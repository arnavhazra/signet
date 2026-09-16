output "namespace" {
  description = "Provisioned Kubernetes namespace."
  value       = kubernetes_namespace.this.metadata[0].name
}

output "vpc_id" {
  description = "Dummy VPC id. On EKS: aws_vpc.this.id."
  value       = local.vpc_id
}

output "vpc_cidr" {
  description = "Dummy VPC CIDR. On EKS: aws_vpc.this.cidr_block."
  value       = var.vpc_cidr
}

output "pod_cidr" {
  description = "Pod overlay CIDR (kindnet / VPC CNI)."
  value       = var.pod_cidr
}

output "service_cidr" {
  description = "Kubernetes service CIDR."
  value       = var.service_cidr
}

output "private_subnet_ids" {
  description = "Dummy private subnet ids. On EKS: aws_subnet.private[*].id (node + dataplane)."
  value       = local.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Dummy public subnet ids. On EKS: aws_subnet.public[*].id (NAT, NLB/ALB)."
  value       = local.public_subnet_ids
}

output "cluster_security_group_id" {
  description = "Dummy cluster SG. On EKS: aws_eks_cluster.this.vpc_config[0].cluster_security_group_id."
  value       = local.cluster_security_group_id
}

output "node_security_group_id" {
  description = "Dummy node SG. On EKS: the node-group launch-template SG."
  value       = local.node_security_group_id
}

output "nat_gateway_ids" {
  description = "Dummy NAT gateway ids. On EKS: aws_nat_gateway.this[*].id."
  value       = local.nat_gateway_ids
}

output "overlay_config_map" {
  description = "ConfigMap that records the kind overlay mapping."
  value       = kubernetes_config_map.overlay.metadata[0].name
}
