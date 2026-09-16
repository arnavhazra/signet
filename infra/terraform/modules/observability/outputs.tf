output "otel_grpc_endpoint" {
  description = "In-cluster OTLP gRPC endpoint (:4317)."
  value       = "http://otel-collector:4317"
}

output "otel_http_endpoint" {
  description = "In-cluster OTLP HTTP endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT to this for the FastAPI runtime."
  value       = "http://otel-collector:4318"
}

output "jaeger_ui_port" {
  description = "Jaeger query UI container port (port-forward 16686)."
  value       = 16686
}

output "prometheus_ui_port" {
  description = "Prometheus UI container port (port-forward 9090)."
  value       = 9090
}

output "jaeger_service" {
  value = kubernetes_service.jaeger.metadata[0].name
}

output "prometheus_service" {
  value = kubernetes_service.prometheus.metadata[0].name
}

output "otel_service" {
  value = kubernetes_service.otel.metadata[0].name
}
