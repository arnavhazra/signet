resource "kubernetes_service_account" "prometheus" {
  metadata {
    name      = "prometheus"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "prometheus"
    })
  }
}

resource "kubernetes_cluster_role" "prometheus" {
  metadata {
    name = "hitl-prometheus"
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "prometheus"
    })
  }

  rule {
    api_groups = [""]
    resources  = ["nodes", "nodes/proxy", "services", "endpoints", "pods"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["discovery.k8s.io"]
    resources  = ["endpointslices"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    non_resource_urls = ["/metrics"]
    verbs             = ["get"]
  }
}

resource "kubernetes_cluster_role_binding" "prometheus" {
  metadata {
    name = "hitl-prometheus"
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "prometheus"
    })
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = kubernetes_cluster_role.prometheus.metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.prometheus.metadata[0].name
    namespace = var.namespace
  }
}

resource "kubernetes_config_map" "prometheus" {
  metadata {
    name      = "prometheus-config"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "prometheus"
    })
  }

  data = {
    "prometheus.yml" = local.prometheus_config
  }
}

resource "kubernetes_deployment" "prometheus" {
  metadata {
    name      = "prometheus"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name"      = "prometheus"
      "app.kubernetes.io/component" = "observability"
    })
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        "app.kubernetes.io/name" = "prometheus"
      }
    }

    template {
      metadata {
        labels = merge(local.labels, {
          "app.kubernetes.io/name"      = "prometheus"
          "app.kubernetes.io/component" = "observability"
        })
      }

      spec {
        service_account_name = kubernetes_service_account.prometheus.metadata[0].name

        container {
          name              = "prometheus"
          image             = var.prometheus_image
          image_pull_policy = var.image_pull_policy
          args = [
            "--config.file=/etc/prometheus/prometheus.yml",
            "--storage.tsdb.path=/prometheus",
            "--storage.tsdb.retention.time=6h",
            "--web.enable-lifecycle",
          ]

          port {
            name           = "http"
            container_port = 9090
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
              path = "/-/healthy"
              port = "http"
            }
            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 3
          }

          readiness_probe {
            http_get {
              path = "/-/ready"
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
          }

          volume_mount {
            name       = "config"
            mount_path = "/etc/prometheus"
            read_only  = true
          }

          volume_mount {
            name       = "data"
            mount_path = "/prometheus"
          }
        }

        volume {
          name = "config"
          config_map {
            name = kubernetes_config_map.prometheus.metadata[0].name
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

resource "kubernetes_service" "prometheus" {
  metadata {
    name      = "prometheus"
    namespace = var.namespace
    labels = merge(local.labels, {
      "app.kubernetes.io/name" = "prometheus"
    })
  }

  spec {
    selector = {
      "app.kubernetes.io/name" = "prometheus"
    }

    port {
      name        = "http"
      port        = 9090
      target_port = "http"
    }
  }
}
