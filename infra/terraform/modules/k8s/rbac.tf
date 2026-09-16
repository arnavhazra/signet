locals {
  labels = {
    "app.kubernetes.io/part-of"    = "hitl-runtime"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  api_irsa_annotations = var.api_irsa_role_arn == "" ? {} : {
    "eks.amazonaws.com/role-arn" = var.api_irsa_role_arn
  }
}

resource "kubernetes_service_account" "api" {
  metadata {
    name        = "api"
    namespace   = var.namespace
    labels      = merge(local.labels, { "app.kubernetes.io/name" = "api" })
    annotations = local.api_irsa_annotations
  }
}

resource "kubernetes_service_account" "frontend" {
  metadata {
    name      = "frontend"
    namespace = var.namespace
    labels    = merge(local.labels, { "app.kubernetes.io/name" = "frontend" })
  }
}
