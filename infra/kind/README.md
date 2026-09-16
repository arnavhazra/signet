# kind cluster (`hitl-runtime`)

Local Kubernetes stand-in for the EKS envelope. One control-plane node, kindnet CNI, pod CIDR `10.244.0.0/16` (the dummy VPC CIDR the Terraform network module advertises).

## Prerequisites

- [kind](https://kind.sigs.k8s.io/docs/user/quick-start/) v0.20+
- Docker Desktop / Colima / an engine kind can talk to
- kubectl
- Optional: Terraform 1.5+ (for `infra/terraform/environments/dev`)

## Create

From the repo root:

```bash
kind create cluster --config infra/kind/cluster.yaml
kubectl cluster-info --context kind-hitl-runtime
kubectl get nodes
```

`KUBE_CONFIG_PATH` (and `KUBECONFIG`) should now point at a kubeconfig that contains the `kind-hitl-runtime` context. Terraform providers read `KUBE_CONFIG_PATH` natively:

```bash
export KUBE_CONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"
```

## Load app images

Data-plane and observability images pull from public registries. The API and frontend images are built in-repo; load them before those Deployments can become Ready:

```bash
docker build -t hitl-runtime-api:dev runtime/
# frontend image is produced by the web workspace when it exists
kind load docker-image hitl-runtime-api:dev --name hitl-runtime
kind load docker-image hitl-runtime-web:dev --name hitl-runtime
```

## Apply the envelope

Raw manifests:

```bash
kubectl apply -f infra/k8s/
```

Or Terraform (same resources, kubernetes + helm providers):

```bash
cd infra/terraform/environments/dev
terraform init
terraform apply
```

## Port-forwards

Workloads are ClusterIP. After pods are up:

```bash
kubectl -n hitl port-forward svc/frontend 3000:3000
kubectl -n hitl port-forward svc/api 8000:8000
kubectl -n hitl port-forward svc/jaeger 16686:16686
kubectl -n hitl port-forward svc/prometheus 9090:9090
kubectl -n hitl port-forward svc/otel-collector 4317:4317 4318:4318
```

The `extraPortMappings` in `cluster.yaml` are unused unless you change Services to `NodePort` with those node ports (8080→api, 3000→frontend, 16686→Jaeger, 9090→Prometheus, 4317/4318→OTLP).

## Delete

```bash
kind delete cluster --name hitl-runtime
```

## EKS equivalent

`kind create cluster` ≈ `aws_eks_cluster` + `aws_eks_node_group` (or Fargate profile) in a VPC. See `infra/README.md` and `infra/terraform/modules/network/README.md`.
