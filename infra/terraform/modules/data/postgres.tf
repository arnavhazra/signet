resource "kubernetes_deployment" "postgres" {
  metadata {
    name      = "postgres"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "postgres"
      "app.kubernetes.io/component" = "data"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "postgres"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "postgres"
          "app.kubernetes.io/component" = "data"
        })
      }

      spec {
        container {
          name              = "postgres"
          image             = var.postgres_image
          image_pull_policy = var.image_pull_policy

          port {
            name           = "pg"
            container_port = 5432
            protocol       = "TCP"
          }

          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.postgres_auth.metadata[0].name
                key  = "POSTGRES_USER"
              }
            }
          }

          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.postgres_auth.metadata[0].name
                key  = "POSTGRES_PASSWORD"
              }
            }
          }

          env {
            name = "POSTGRES_DB"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.postgres_auth.metadata[0].name
                key  = "POSTGRES_DB"
              }
            }
          }

          env {
            name  = "PGDATA"
            value = "/var/lib/postgresql/data/pgdata"
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
            exec {
              command = ["pg_isready", "-U", var.postgres_user, "-d", var.postgres_db]
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 6
          }

          readiness_probe {
            exec {
              command = ["pg_isready", "-U", var.postgres_user, "-d", var.postgres_db]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 6
          }

          volume_mount {
            name       = "data"
            mount_path = "/var/lib/postgresql/data"
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

resource "kubernetes_service" "postgres" {
  metadata {
    name      = "postgres"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "postgres"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "postgres"
    }

    port {
      name        = "pg"
      port        = 5432
      target_port = "pg"
    }
  }
}
