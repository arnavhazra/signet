output "api_service" {
  description = "In-cluster API DNS: http://api:8000"
  value       = kubernetes_service.api.metadata[0].name
}

output "frontend_service" {
  description = "In-cluster frontend DNS: http://frontend:3000"
  value       = kubernetes_service.frontend.metadata[0].name
}

output "api_service_account" {
  description = "API ServiceAccount. On EKS this carries the IRSA annotation."
  value       = kubernetes_service_account.api.metadata[0].name
}

output "canary_annotation" {
  description = "Current canary flag on the API Deployment."
  value       = var.canary
}

output "hpa_name" {
  description = "API HPA stub name, if enabled."
  value       = try(kubernetes_horizontal_pod_autoscaler_v2.api[0].metadata[0].name, null)
}
