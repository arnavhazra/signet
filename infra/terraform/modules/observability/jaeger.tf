resource "kubernetes_deployment" "jaeger" {
  metadata {
    name      = "jaeger"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "jaeger"
      "app.kubernetes.io/component" = "observability"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "jaeger"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "jaeger"
          "app.kubernetes.io/component" = "observability"
        })
      }

      spec {
        container {
          name              = "jaeger"
          image             = var.jaeger_image
          image_pull_policy = var.image_pull_policy

          env {
            name  = "COLLECTOR_OTLP_ENABLED"
            value = "true"
          }

          port {
            name           = "ui"
            container_port = 16686
          }

          port {
            name           = "otlp-grpc"
            container_port = 4317
          }

          port {
            name           = "otlp-http"
            container_port = 4318
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          liveness_probe {
            tcp_socket {
              port = "ui"
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 3
          }

          readiness_probe {
            tcp_socket {
              port = "ui"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "jaeger" {
  metadata {
    name      = "jaeger"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "jaeger"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "jaeger"
    }

    port {
      name        = "ui"
      port        = 16686
      target_port = "ui"
    }

    port {
      name        = "otlp-grpc"
      port        = 4317
      target_port = "otlp-grpc"
    }

    port {
      name        = "otlp-http"
      port        = 4318
      target_port = "otlp-http"
    }
  }
}
