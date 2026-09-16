output "secret_name" {
  description = "Opaque secret the API/frontend consume (DATABASE_URL, REDIS_URL, NATS_URL, JWT_SECRET, API_KEYS)."
  value       = kubernetes_secret.runtime.metadata[0].name
}

output "postgres_secret_name" {
  description = "Postgres bootstrap secret. On EKS this is an RDS master secret in Secrets Manager."
  value       = kubernetes_secret.postgres_auth.metadata[0].name
}

output "database_url_host" {
  description = "In-cluster DSN host (postgres service). On EKS: the RDS endpoint."
  value       = "postgres"
}

output "redis_url_host" {
  description = "In-cluster Redis host. On EKS: ElastiCache primary endpoint."
  value       = "redis"
}

output "nats_url" {
  description = "In-cluster NATS URL. On EKS: MSK brokers or NATS service DNS."
  value       = local.nats_url
}

output "postgres_service" {
  value = kubernetes_service.postgres.metadata[0].name
}

output "redis_service" {
  value = kubernetes_service.redis.metadata[0].name
}

output "nats_service" {
  value = kubernetes_service.nats.metadata[0].name
}
