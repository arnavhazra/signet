resource "kubernetes_deployment" "redis" {
  metadata {
    name      = "redis"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "redis"
      "app.kubernetes.io/component" = "data"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "redis"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "redis"
          "app.kubernetes.io/component" = "data"
        })
      }

      spec {
        container {
          name              = "redis"
          image             = var.redis_image
          image_pull_policy = var.image_pull_policy
          args              = ["--appendonly", "yes"]

          port {
            name           = "redis"
            container_port = 6379
            protocol       = "TCP"
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
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 10
            period_seconds        = 20
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          readiness_probe {
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          volume_mount {
            name       = "data"
            mount_path = "/data"
          }
        }

        volume {
          name = "data"
          empty_dir {}
        }
      }
    }
  }
}

resource "kubernetes_service" "redis" {
  metadata {
    name      = "redis"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "redis"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "redis"
    }

    port {
      name        = "redis"
      port        = 6379
      target_port = "redis"
    }
  }
}
