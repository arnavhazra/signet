locals {
  labels = {
    "app.kubernetes.io/part-of"    = "hitl-runtime"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  otel_config = <<-EOT
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
    processors:
      batch:
        timeout: 5s
        send_batch_size: 512
      memory_limiter:
        check_interval: 1s
        limit_mib: 256
        spike_limit_mib: 64
      resource:
        attributes:
          - key: service.namespace
            value: hitl-runtime
            action: upsert
    exporters:
      debug:
        verbosity: basic
      otlp/jaeger:
        endpoint: jaeger:4317
        tls:
          insecure: true
      prometheus:
        endpoint: 0.0.0.0:8889
        namespace: hitl
        const_labels:
          env: dev
    extensions:
      health_check:
        endpoint: 0.0.0.0:13133
    service:
      extensions: [health_check]
      telemetry:
        logs:
          level: info
      pipelines:
        traces:
          receivers: [otlp]
          processors: [memory_limiter, resource, batch]
          exporters: [otlp/jaeger, debug]
        metrics:
          receivers: [otlp]
          processors: [memory_limiter, resource, batch]
          exporters: [prometheus, debug]
        logs:
          receivers: [otlp]
          processors: [memory_limiter, resource, batch]
          exporters: [debug]
  EOT

  prometheus_config = <<-EOT
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
      external_labels:
        cluster: hitl-runtime
        env: dev
    scrape_configs:
      - job_name: prometheus
        static_configs:
          - targets: ["localhost:9090"]
      - job_name: otel-collector
        static_configs:
          - targets: ["otel-collector:8888"]
      - job_name: otel-collector-exported
        static_configs:
          - targets: ["otel-collector:8889"]
      - job_name: api
        metrics_path: /metrics
        static_configs:
          - targets: ["api:8000"]
            labels:
              service: api
              part_of: hitl-runtime
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - ${var.namespace}
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: "true"
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            regex: ([^:]+)(?::\d+)?;(\d+)
            replacement: $1:$2
            target_label: __address__
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - source_labels: [__meta_kubernetes_namespace]
            action: replace
            target_label: kubernetes_namespace
          - source_labels: [__meta_kubernetes_pod_name]
            action: replace
            target_label: kubernetes_pod_name
  EOT
}
