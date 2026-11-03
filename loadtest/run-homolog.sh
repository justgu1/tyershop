#!/usr/bin/env bash
# Carga na HOMOLOGAÇÃO, com Mercado Pago e Melhor Envio de verdade (sandbox): up | run | down. Exige CONFIRMO=yes.
# Nunca aponte para produção; e-mails da carga terminam em ".invalid" (nenhum sai). Não edite o arquivo enquanto ele roda.
set -euo pipefail
NS=apps
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/saida-homolog}"
SCALE="${RATE_LIMIT_SCALE:-200}"
SITE="https://homolog.tyershop.com"
POD_WAIT="${POD_WAIT:-180}"   # segundos para o pod do k6 aparecer
RUN_WAIT="${RUN_WAIT:-7200}"  # teto de segundos para o k6 terminar
mkdir -p "$OUT"
[ "${CONFIRMO:-}" = "yes" ] || { echo "Cria clientes, pedidos e pagamentos de teste na homologação. Rode com CONFIRMO=yes."; exit 1; }

backend_pod() { kubectl -n "$NS" get pod -l app=tyershop-backend -o jsonpath='{.items[0].metadata.name}'; }
restart_backend() {
  kubectl -n "$NS" delete pod -l app=tyershop-backend --wait=false >/dev/null
  sleep 5
  kubectl -n "$NS" rollout status deploy/tyershop-backend --timeout=300s
}
# Devolve os limites normais e apaga o job: roda ao fim de `run`, em erro e em Ctrl-C, para o limite alto nunca ficar esquecido.
normalize() {
  kubectl -n "$NS" delete job loadtest-homolog --ignore-not-found >/dev/null || true
  kubectl -n "$NS" delete configmap loadtest-homolog-k6 tyershop-janela-de-teste --ignore-not-found >/dev/null || true
  restart_backend
}
first_match() { awk -v re="$1" 'match($0, re) { print substr($0, RSTART, RLENGTH); exit }'; }

case "${1:-}" in
up)
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/inicio.txt"
  kubectl -n "$NS" cp "$HERE/produto-carga.js" "$(backend_pod):/tmp/produto-carga.js"
  kubectl -n "$NS" exec "$(backend_pod)" -- sh -c 'cd /app && NODE_PATH=/app/node_modules npx medusa exec /tmp/produto-carga.js 2>&1 | grep -E "^produto|rror"'
  trap 'echo "falhou: voltando os limites normais"; normalize' ERR INT TERM
  kubectl -n "$NS" create configmap tyershop-janela-de-teste --from-literal=RATE_LIMIT_SCALE="$SCALE" --dry-run=client -o yaml | kubectl apply -f -
  restart_backend
  trap - ERR INT TERM
  echo "limites ampliados (x$SCALE): rode '$0 run' e depois '$0 down'"
  ;;
run)
  HTML="$(curl -fsS "$SITE/checkout")"
  PK="$(first_match 'pk_[0-9a-f]{20,}' <<<"$HTML")"
  MP="$(first_match 'TEST-[0-9a-f-]{20,}' <<<"$HTML")"
  [ -n "$PK" ] && [ -n "$MP" ] || { echo "não achei as chaves públicas no site"; exit 1; }
  SAMPLER=""
  trap '[ -z "$SAMPLER" ] || kill "$SAMPLER" 2>/dev/null || true; echo "limites normais de volta"; normalize' EXIT INT TERM
  kubectl -n "$NS" delete job loadtest-homolog --ignore-not-found >/dev/null
  kubectl -n "$NS" create configmap loadtest-homolog-k6 --from-file=load.js="$HERE/k6/load.js" --from-file=guards.js="$HERE/k6/guards.js" --dry-run=client -o yaml | kubectl apply -f -
  export PUBLISHABLE_KEY="$PK" MP_PUBLIC_KEY="$MP" CONFIRMO PAY_RATE="${PAY_RATE:-0.2}" PEOPLE="${PEOPLE:-100,200,300}" HOLD_SECONDS="${HOLD_SECONDS:-300}" THINK_SCALE="${THINK_SCALE:-1}" USERS="${USERS:-300}"
  envsubst < "$HERE/k8s/k6-homolog-job.yaml" | kubectl apply -f -
  : > "$OUT/uso.csv"
  ( while kubectl -n "$NS" get job loadtest-homolog -o jsonpath='{.status.active}' 2>/dev/null | grep -q 1; do
      echo "$(date -u +%H:%M:%S),$(kubectl -n "$NS" top pod --no-headers 2>/dev/null | grep -E 'tyershop-(backend|frontend)|postgres|redis' | awk '{printf "%s %s %s;", $1,$2,$3}')" >> "$OUT/uso.csv"
      sleep 15
    done ) &
  SAMPLER=$!
  POD=""; waited=0
  until [ -n "$POD" ]; do
    POD="$(kubectl -n "$NS" get pod -l job-name=loadtest-homolog -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
    [ -n "$POD" ] && break
    waited=$((waited + 2)); [ "$waited" -lt "$POD_WAIT" ] || { echo "o pod do k6 não apareceu em ${POD_WAIT}s"; exit 1; }
    sleep 2
  done
  waited=0
  until kubectl -n "$NS" get job loadtest-homolog -o jsonpath='{.status.succeeded}{.status.failed}' | grep -q '[1-9]'; do
    reason="$(kubectl -n "$NS" get pod "$POD" -o jsonpath='{.status.containerStatuses[0].state.waiting.reason}' 2>/dev/null || true)"
    case "$reason" in ImagePullBackOff|ErrImagePull|CreateContainerConfigError) echo "pod do k6 parado: $reason"; exit 1 ;; esac
    waited=$((waited + 20)); [ "$waited" -lt "$RUN_WAIT" ] || { echo "o k6 passou de ${RUN_WAIT}s"; exit 1; }
    sleep 20
  done
  kubectl -n "$NS" logs "$POD" > "$OUT/k6.log" 2>&1 || true
  grep -o '###RESULT###.*###END###' "$OUT/k6.log" | sed 's/###RESULT###//; s/###END###//' > "$OUT/resultado.json" || true
  echo "salvo em $OUT"
  ;;
down)
  kubectl -n "$NS" cp "$HERE/limpar-carga.js" "$(backend_pod):/tmp/limpar-carga.js"
  kubectl -n "$NS" exec "$(backend_pod)" -- sh -c 'cd /app && NODE_PATH=/app/node_modules npx medusa exec /tmp/limpar-carga.js 2>&1 | grep -E "removid|rror"'
  normalize
  echo "limites normais de volta e dados da carga removidos"
  ;;
*)
  echo "uso: CONFIRMO=yes $0 up|run|down"; exit 1 ;;
esac
