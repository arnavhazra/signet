resource "kubernetes_deployment" "frontend" {
  metadata {
    name      = "frontend"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "frontend"
      "app.kubernetes.io/component" = "ui"
    })
  }

  spec {
    replicas = var.frontend_replicas

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "frontend"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "frontend"
          "app.kubernetes.io/component" = "ui"
        })
      }

      spec {
        service_account_name = kubernetes_service_account.frontend.metadata[0].name

        container {
          name              = "frontend"
          image             = var.frontend_image
          image_pull_policy = var.image_pull_policy

          port {
            name           = "http"
            container_port = 3000
            protocol       = "TCP"
          }

          env {
            # Unused by nginx. Browser URL is baked as VITE_API_URL at docker build
            # (http://localhost:8000 for kind port-forward). http://api:8000 is in-cluster only.
            name  = "API_URL"
            value = "http://api:8000"
          }

          env {
            name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
            value = var.otel_exporter_otlp_endpoint
          }

          env {
            name  = "OTEL_SERVICE_NAME"
            value = "hitl-frontend"
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              cpu    = "250m"
              memory = "256Mi"
            }
          }

          liveness_probe {
            tcp_socket {
              port = "http"
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 3
          }

          readiness_probe {
            tcp_socket {
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }
        }
      }
    }
  }

  wait_for_rollout = var.wait_for_rollout
}

resource "kubernetes_service" "frontend" {
  metadata {
    name      = "frontend"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "frontend"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "frontend"
    }

    port {
      name        = "http"
      port        = 3000
      target_port = "http"
    }
  }
}
