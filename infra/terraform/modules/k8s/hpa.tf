resource "kubernetes_horizontal_pod_autoscaler_v2" "api" {
  count = var.enable_hpa ? 1 : 0

  metadata {
    name      = "api"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "api"
    })
    annotations = {
      "addepar.dev/stub" = "true"
      "addepar.dev/note" = "Requires metrics-server on kind; on EKS use the metrics-server add-on or Amazon Managed Prometheus adapters."
    }
  }

  spec {
    min_replicas = var.hpa_min_replicas
    max_replicas = var.hpa_max_replicas

    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment.api.metadata[0].name
    }

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = var.hpa_cpu_target
        }
      }
    }
  }
}
