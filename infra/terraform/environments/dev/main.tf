module "network" {
  source = "../../modules/network"

  namespace    = var.namespace
  environment  = var.environment
  cluster_name = var.cluster_name
}

module "data" {
  source = "../../modules/data"

  namespace         = module.network.namespace
  postgres_password = var.postgres_password
  jwt_secret        = var.jwt_secret
  api_keys          = var.api_keys

  depends_on = [module.network]
}

module "observability" {
  source = "../../modules/observability"

  namespace = module.network.namespace

  depends_on = [module.network]
}

module "k8s" {
  source = "../../modules/k8s"

  namespace      = module.network.namespace
  secret_name    = module.data.secret_name
  api_image      = var.api_image
  frontend_image = var.frontend_image
  canary         = var.canary

  otel_exporter_otlp_endpoint = module.observability.otel_http_endpoint

  depends_on = [module.data, module.observability]
}
