# Observability module (OTel collector, Prometheus, Jaeger)

Local stand-in for **ADOT + AMP + Amazon Managed Grafana / X-Ray**. Traces go OTLP → collector → Jaeger. Metrics go OTLP → collector Prometheus exporter → Prometheus scrape, plus a static scrape of `api:8000/metrics`.

## What this module applies locally

| Workload | Image | Ports | Probe |
|---|---|---|---|
| otel-collector | `otel/opentelemetry-collector-contrib:0.104.0` | 4317 gRPC, 4318 HTTP, 8888 self, 8889 export | `GET /` on 13133 |
| jaeger | `jaegertracing/all-in-one:1.57` | 16686 UI, 4317/4318 OTLP | `GET /` on 16686 |
| prometheus | `prom/prometheus:v2.53.0` | 9090 | `/-/healthy`, `/-/ready` |

Prometheus has a ServiceAccount + ClusterRole so `kubernetes_sd_configs` can discover pods annotated `prometheus.io/scrape=true` (the API Deployment sets this).

UI ports after port-forward:

- Jaeger: http://localhost:16686
- Prometheus: http://localhost:9090
- Grafana dashboard JSON (optional import): `infra/observability/grafana-dashboard.json`

Grafana itself is **not** deployed; the JSON is the dashboard contract. Jaeger + Prometheus UIs are enough for the 8-minute demo.

## API contract

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
```

## EKS equivalent (interview story — do not apply here)

### ADOT (AWS Distro for OpenTelemetry)

```hcl
# EKS add-on, not a raw Deployment of contrib
resource "aws_eks_addon" "adot" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "adot"
}

# Collector CRD (OpenTelemetryCollector) ships traces to X-Ray
# and metrics to AMP via sigv4auth + IRSA.
```

IRSA on the collector ServiceAccount:

```hcl
resource "aws_iam_role" "adot" {
  assume_role_policy = data.aws_iam_policy_document.adot_irsa.json
  # policies: AWSXRayDaemonWriteAccess, AmazonPrometheusRemoteWriteAccess
}

# annotation: eks.amazonaws.com/role-arn = aws_iam_role.adot.arn
```

### Amazon Managed Prometheus (AMP) instead of in-cluster Prometheus

```hcl
resource "aws_prometheus_workspace" "hitl" {
  alias = var.cluster_name
}
```

Collector exporter: `prometheusremotewrite` to `aws_prometheus_workspace.hitl.prometheus_endpoint` with `sigv4`.

### Amazon Managed Grafana / X-Ray

- Grafana workspace with AMP as datasource; import `grafana-dashboard.json`.
- X-Ray console instead of Jaeger UI (ADOT `awsxray` exporter). Jaeger remains a valid self-hosted option on EKS if the org wants OTLP-native trace search.

### Why not CloudWatch-only

The runtime already emits OTLP. ADOT keeps the **same** `OTEL_EXPORTER_OTLP_ENDPOINT` contract; only the collector exporters change. That is the point of the local collector.
