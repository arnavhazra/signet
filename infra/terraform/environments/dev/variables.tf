variable "kube_config_path" {
  type        = string
  default     = null
  description = "Kubeconfig path. Leave null to use KUBE_CONFIG_PATH / KUBECONFIG."
}

variable "kube_context" {
  type        = string
  default     = "kind-hitl-runtime"
  description = "kubectl context. kind create cluster --name hitl-runtime."
}

variable "namespace" {
  type    = string
  default = "hitl"
}

variable "cluster_name" {
  type    = string
  default = "hitl-runtime"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "api_image" {
  type    = string
  default = "hitl-runtime-api:dev"
}

variable "frontend_image" {
  type    = string
  default = "hitl-runtime-web:dev"
}

variable "canary" {
  type    = string
  default = "false"
}

# PLACEHOLDER credentials — never real secrets. Override via TF_VAR_* locally if needed.
variable "postgres_password" {
  type      = string
  default   = "changeme"
  sensitive = true
}

variable "jwt_secret" {
  type      = string
  default   = "replace-me-with-a-real-jwt-secret"
  sensitive = true
}

variable "api_keys" {
  type      = string
  default   = "demo-runtime-key"
  sensitive = true
}
