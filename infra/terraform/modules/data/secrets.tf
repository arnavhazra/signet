locals {
  database_url = "postgresql+asyncpg://${var.postgres_user}:${var.postgres_password}@postgres:5432/${var.postgres_db}"
  redis_url    = "redis://redis:6379/0"
  nats_url     = "nats://nats:4222"

  labels = {
    "app.kubernetes.io/part-of"    = "hitl-runtime"
    "app.kubernetes.io/managed-by" = "terraform"
  }
}

resource "kubernetes_secret" "postgres_auth" {
  metadata {
    name      = "postgres-auth"
    namespace = var.namespace
    labels    = merge(local.labels, { "app.kubernetes.io/name" = "postgres" })
  }

  data = {
    POSTGRES_USER     = var.postgres_user
    POSTGRES_PASSWORD = var.postgres_password
    POSTGRES_DB       = var.postgres_db
  }

  type = "Opaque"
}

resource "kubernetes_secret" "runtime" {
  metadata {
    name      = "runtime-secrets"
    namespace = var.namespace
    labels    = merge(local.labels, { "app.kubernetes.io/name" = "runtime-secrets" })
  }

  data = {
    DATABASE_URL = local.database_url
    REDIS_URL    = local.redis_url
    NATS_URL     = local.nats_url
    JWT_SECRET   = var.jwt_secret
    API_KEYS     = var.api_keys
  }

  type = "Opaque"
}
