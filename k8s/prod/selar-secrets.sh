#!/usr/bin/env bash
# Gera sealed-secret.yaml de produção a partir de secrets.env (fora do git). Só valores preenchidos entram;
# rode de novo quando os que faltam existirem (chave publicável e região só saem do admin depois que o backend sobe).
set -euo pipefail
cd "$(dirname "$0")"

env_file="${1:-secrets.env}"
[ -f "$env_file" ] || { echo "faltou $env_file (copie de secrets.env.example)" >&2; exit 1; }

args=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* || -z "$value" ]] && continue
  args+=("--from-literal=$key=$value")
done < "$env_file"
[ "${#args[@]}" -gt 0 ] || { echo "nenhum valor preenchido em $env_file" >&2; exit 1; }

kubectl create secret generic tyershop-secrets --namespace tyershop-prod "${args[@]}" --dry-run=client -o json \
  | kubeseal --controller-name sealed-secrets-controller --controller-namespace infrastructure --format yaml \
  > sealed-secret.yaml
echo "sealed-secret.yaml gerado com ${#args[@]} chave(s)"
