variable "namespace" {
  type        = string
  description = "Namespace created by the network module."
}

variable "otel_image" {
  type    = string
  default = "otel/opentelemetry-collector-contrib:0.104.0"
}

variable "prometheus_image" {
  type    = string
  default = "prom/prometheus:v2.53.0"
}

variable "jaeger_image" {
  type    = string
  default = "jaegertracing/all-in-one:1.57"
}

variable "image_pull_policy" {
  type    = string
  default = "IfNotPresent"
}
