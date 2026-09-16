output "namespace" {
  value = module.network.namespace
}

output "vpc_id" {
  description = "Dummy VPC id (EKS: aws_vpc.id)."
  value       = module.network.vpc_id
}

output "private_subnet_ids" {
  description = "Dummy private subnets (EKS: aws_subnet.private)."
  value       = module.network.private_subnet_ids
}

output "api_url_in_cluster" {
  value = "http://api:8000"
}

output "frontend_url_in_cluster" {
  value = "http://frontend:3000"
}

output "otel_exporter_otlp_endpoint" {
  value = module.observability.otel_grpc_endpoint
}

output "port_forward_commands" {
  description = "Copy-paste after terraform apply (ClusterIP services)."
  value       = <<-EOT
    kubectl -n ${module.network.namespace} port-forward svc/frontend 3000:3000
    kubectl -n ${module.network.namespace} port-forward svc/api 8000:8000
    kubectl -n ${module.network.namespace} port-forward svc/jaeger 16686:16686
    kubectl -n ${module.network.namespace} port-forward svc/prometheus 9090:9090
    kubectl -n ${module.network.namespace} port-forward svc/otel-collector 4317:4317 4318:4318
  EOT
}

output "ui_ports" {
  description = "Host ports after the port-forwards above."
  value = {
    frontend   = "http://localhost:3000"
    api        = "http://localhost:8000"
    jaeger     = "http://localhost:16686"
    prometheus = "http://localhost:9090"
    otlp_grpc  = "localhost:4317"
    otlp_http  = "localhost:4318"
  }
}
