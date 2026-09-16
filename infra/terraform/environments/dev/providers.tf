# Providers talk to kind via kubeconfig. No AWS account is required.
#
# Resolution order for the cluster:
#   1. -var='kube_config_path=...' / TF_VAR_kube_config_path
#   2. KUBE_CONFIG_PATH (native to both providers when config_path is unset)
#   3. ~/.kube/config
#
#   export KUBE_CONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"

provider "kubernetes" {
  config_path    = var.kube_config_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kube_config_path
    config_context = var.kube_context
  }
}
