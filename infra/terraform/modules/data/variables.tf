variable "namespace" {
  type        = string
  description = "Namespace created by the network module."
}

variable "postgres_image" {
  type        = string
  default     = "postgres:16-alpine"
  description = "Postgres image. On EKS this is replaced by RDS (no in-cluster engine)."
}

variable "redis_image" {
  type        = string
  default     = "redis:7-alpine"
  description = "Redis image. On EKS this is replaced by ElastiCache."
}

variable "nats_image" {
  type        = string
  default     = "nats:2.10-alpine"
  description = "NATS image with JetStream. On EKS: MSK, NATS on EKS, or NATS SaaS."
}

variable "postgres_user" {
  type    = string
  default = "hitl"
}

variable "postgres_db" {
  type    = string
  default = "hitl"
}

variable "postgres_password" {
  type        = string
  default     = "changeme"
  sensitive   = true
  description = "PLACEHOLDER only. Never a real secret. On EKS: Secrets Manager."
}

variable "jwt_secret" {
  type        = string
  default     = "replace-me-with-a-real-jwt-secret"
  sensitive   = true
  description = "PLACEHOLDER JWT HMAC secret."
}

variable "api_keys" {
  type        = string
  default     = "demo-runtime-key"
  sensitive   = true
  description = "Comma-separated runtime API keys (optional role:key form also accepted)."
}

variable "image_pull_policy" {
  type    = string
  default = "IfNotPresent"
}
