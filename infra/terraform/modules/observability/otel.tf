resource "kubernetes_config_map" "otel" {
  metadata {
    name      = "otel-collector-config"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "otel-collector"
      "app.kubernetes.io/component" = "observability"
    })
  }

  data = {
    "config.yaml" = local.otel_config
  }
}

resource "kubernetes_deployment" "otel" {
  metadata {
    name      = "otel-collector"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "otel-collector"
      "app.kubernetes.io/component" = "observability"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "otel-collector"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "otel-collector"
          "app.kubernetes.io/component" = "observability"
        })
      }

      spec {
        container {
          name              = "otel-collector"
          image             = var.otel_image
          image_pull_policy = var.image_pull_policy
          args              = ["--config=/etc/otelcol-contrib/config.yaml"]

          port {
            name           = "otlp-grpc"
            container_port = 4317
          }

          port {
            name           = "otlp-http"
            container_port = 4318
          }

          port {
            name           = "metrics"
            container_port = 8888
          }

          port {
            name           = "prom-export"
            container_port = 8889
          }

          port {
            name           = "health"
            container_port = 13133
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
            http_get {
              path = "/"
              port = "health"
            }
            initial_delay_seconds = 10
            period_seconds        = 20
            timeout_seconds       = 3
          }

          readiness_probe {
            http_get {
              path = "/"
              port = "health"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/otelcol-contrib"
            read_only  = true
          }
        }

        volume {
          name = "config"
          config_map {
            name = kubernetes_config_map.otel.metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "otel" {
  metadata {
    name      = "otel-collector"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "otel-collector"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "otel-collector"
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

    port {
      name        = "metrics"
      port        = 8888
      target_port = "metrics"
    }

    port {
      name        = "prom-export"
      port        = 8889
      target_port = "prom-export"
    }
  }
}
