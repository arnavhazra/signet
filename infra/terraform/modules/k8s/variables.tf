variable "namespace" {
  type        = string
  description = "Namespace created by the network module."
}

variable "secret_name" {
  type        = string
  description = "runtime-secrets Secret name from the data module."
  default     = "runtime-secrets"
}

variable "api_image" {
  type        = string
  default     = "hitl-runtime-api:dev"
  description = "Image from runtime/Dockerfile (container port 8000)."
}

variable "frontend_image" {
  type        = string
  default     = "hitl-runtime-web:dev"
  description = "Image from web/Dockerfile (nginx port 3000). Bake VITE_API_URL=http://localhost:8000 for kind port-forward."
}

variable "api_replicas" {
  type    = number
  default = 1
}

variable "frontend_replicas" {
  type    = number
  default = 1
}

variable "image_pull_policy" {
  type    = string
  default = "IfNotPresent"
}

variable "otel_exporter_otlp_endpoint" {
  type        = string
  default     = "http://otel-collector:4318"
  description = "OTLP HTTP endpoint (API uses the HTTP exporter). gRPC is :4317."
}

variable "api_irsa_role_arn" {
  type        = string
  default     = ""
  description = "On EKS, the IAM role ARN for the api ServiceAccount. Empty on kind."
}

variable "enable_hpa" {
  type        = bool
  default     = true
  description = "Create the API HPA stub. Ineffective on kind without metrics-server."
}

variable "hpa_min_replicas" {
  type    = number
  default = 1
}

variable "hpa_max_replicas" {
  type    = number
  default = 3
}

variable "hpa_cpu_target" {
  type    = number
  default = 70
}

variable "canary" {
  type        = string
  default     = "false"
  description = "addepar.dev/canary annotation on the API Deployment."
}

variable "wait_for_rollout" {
  type        = bool
  default     = false
  description = "Set true only after images are loaded into kind."
}
