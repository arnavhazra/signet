resource "kubernetes_deployment" "api" {
  metadata {
    name      = "api"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "api"
      "app.kubernetes.io/component" = "orchestrator"
    })
    annotations = {
      "addepar.dev/canary" = var.canary
    }
  }

  spec {
    replicas = var.api_replicas

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "api"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "api"
          "app.kubernetes.io/component" = "orchestrator"
        })
        annotations = {
          "addepar.dev/canary"   = var.canary
          "prometheus.io/scrape" = "true"
          "prometheus.io/port"   = "8000"
          "prometheus.io/path"   = "/metrics"
        }
      }

      spec {
        service_account_name = kubernetes_service_account.api.metadata[0].name

        container {
          name              = "api"
          image             = var.api_image
          image_pull_policy = var.image_pull_policy

          port {
            name           = "http"
            container_port = 8000
            protocol       = "TCP"
          }

          env_from {
            secret_ref {
              name = var.secret_name
            }
          }

          env {
            name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
            value = var.otel_exporter_otlp_endpoint
          }

          env {
            name  = "OTEL_SERVICE_NAME"
            value = "hitl-api"
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = "http"
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 3
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/ready"
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 3
          }
        }
      }
    }
  }

  wait_for_rollout = var.wait_for_rollout
}

resource "kubernetes_service" "api" {
  metadata {
    name      = "api"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "api"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "api"
    }

    port {
      name        = "http"
      port        = 8000
      target_port = "http"
    }
  }
}
