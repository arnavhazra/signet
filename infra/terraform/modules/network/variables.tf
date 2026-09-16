variable "namespace" {
  type        = string
  description = "Kubernetes namespace for the HITL runtime."
}

variable "environment" {
  type        = string
  description = "Environment label (dev/stage/prod). Maps to an EKS cluster name suffix."
  default     = "dev"
}

variable "cluster_name" {
  type        = string
  description = "kind cluster name. On EKS this is aws_eks_cluster.name."
  default     = "hitl-runtime"
}

variable "vpc_cidr" {
  type        = string
  description = "Dummy VPC CIDR. On EKS this is aws_vpc.cidr_block."
  default     = "10.0.0.0/16"
}

variable "pod_cidr" {
  type        = string
  description = "kind pod overlay (kindnet). On EKS this is the VPC CNI / prefix-delegation pool."
  default     = "10.244.0.0/16"
}

variable "service_cidr" {
  type        = string
  description = "Kubernetes service CIDR."
  default     = "10.96.0.0/12"
}

variable "azs" {
  type        = list(string)
  description = "Dummy AZ names so callers can keep the same interface as aws_subnet."
  default     = ["kind-a", "kind-b"]
}
