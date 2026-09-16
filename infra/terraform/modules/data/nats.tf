resource "kubernetes_config_map" "nats" {
  metadata {
    name      = "nats-config"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "nats"
    })
  }

  data = {
    "nats.conf" = <<-EOT
      server_name: nats
      port: 4222
      http_port: 8222
      jetstream {
        store_dir: /data
        max_mem: 256M
        max_file: 1G
      }
    EOT
  }
}

resource "kubernetes_deployment" "nats" {
  metadata {
    name      = "nats"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "nats"
      "app.kubernetes.io/component" = "data"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "nats"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "nats"
          "app.kubernetes.io/component" = "data"
        })
      }

      spec {
        container {
          name              = "nats"
          image             = var.nats_image
          image_pull_policy = var.image_pull_policy
          args              = ["-c", "/etc/nats/nats.conf"]

          port {
            name           = "client"
            container_port = 4222
            protocol       = "TCP"
          }

          port {
            name           = "monitor"
            container_port = 8222
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
            http_get {
              path = "/healthz"
              port = "monitor"
            }
            initial_delay_seconds = 10
            period_seconds        = 20
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          readiness_probe {
            http_get {
              path = "/healthz"
              port = "monitor"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/nats"
            read_only  = true
          }

          volume_mount {
            name       = "data"
            mount_path = "/data"
          }
        }

        volume {
          name = "config"
          config_map {
            name = kubernetes_config_map.nats.metadata[0].name
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

resource "kubernetes_service" "nats" {
  metadata {
    name      = "nats"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "nats"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "nats"
    }

    port {
      name        = "client"
      port        = 4222
      target_port = "client"
    }

    port {
      name        = "monitor"
      port        = 8222
      target_port = "monitor"
    }
  }
}
