#!/usr/bin/env bash
# Teste de capacidade DENTRO do cluster. Reversível: `down` devolve tudo ao estado anterior.
#   loadtest/run-in-cluster.sh up      sobe simulador, banco de teste (cópia da homologação) e backends de teste
#   loadtest/run-in-cluster.sh run     roda o k6 e salva o resultado em $OUT
#   loadtest/run-in-cluster.sh down    remove tudo o que o `up` criou
#
# Modo padrão (ISOLATED=1): o teste usa um PostgreSQL próprio e backends próprios; o banco compartilhado só é LIDO uma vez (cópia)
# e nada do ArgoCD é alterado. Com ISOLATED=0 o teste usa o backend e o banco reais da homologação (arriscado: derrubou o banco
# compartilhado uma vez; só com o banco dimensionado).
# Variáveis: EXTRA_BACKENDS (réplicas do backend de teste, padrão 1), PROFILE (capacity|sessions), PEOPLE ("100,200,300"),
#            HOLD_SECONDS, THINK_SCALE, USERS, STEP_SECONDS, LEVELS.
# IMPORTANTE: não edite este arquivo enquanto ele roda (o bash lê o script aos poucos).
set -euo pipefail
NS=apps
ISOLATED="${ISOLATED:-1}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/saida}"
mkdir -p "$OUT"
if [ "$ISOLATED" = "1" ]; then BACKEND_DEPLOY=tyershop-backend-extra; API_SVC=loadtest-backend; else BACKEND_DEPLOY=tyershop-backend; API_SVC=tyershop-backend; fi
TEST_DB="postgres://tyershop:carga@loadtest-postgres.$NS.svc.cluster.local:5432/tyershop"
MOCK="http://loadtest-mock.$NS.svc.cluster.local:8099"

backend() { kubectl -n "$NS" exec deploy/"$BACKEND_DEPLOY" -- "$@"; }
wait_backend() { kubectl -n "$NS" rollout status deploy/"$BACKEND_DEPLOY" --timeout=300s; }

node_pg() { # lê JS do stdin e roda no backend com o pg já instalado
  kubectl -n "$NS" exec -i deploy/"$BACKEND_DEPLOY" -- node -e "
const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const fn=new Function('c', 'return (async()=>{' + require('fs').readFileSync(0,'utf8') + '})()');
try{await fn(c)}finally{await c.end()}})().catch(e=>{console.error('ERRO',e.message);process.exit(1)})"
}

case "${1:-}" in
up)
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/inicio.txt"
  kubectl -n "$NS" create configmap loadtest-mock --from-file=mock-gateways.mjs="$HERE/mock-gateways.mjs" --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -f "$HERE/k8s/mock.yaml"
  kubectl -n "$NS" rollout status deploy/loadtest-mock --timeout=120s

  if [ "$ISOLATED" = "1" ]; then
    kubectl -n "$NS" delete job loadtest-copia-banco --ignore-not-found >/dev/null
    kubectl apply -f "$HERE/k8s/postgres.yaml"
    kubectl -n "$NS" rollout status deploy/loadtest-postgres --timeout=180s
    kubectl -n "$NS" wait --for=condition=complete job/loadtest-copia-banco --timeout=300s
    # Backends de teste: cópia do backend real (mesma imagem e configuração), com o banco de teste e os simuladores.
    kubectl -n "$NS" get deploy tyershop-backend -o json | EXTRA="${EXTRA_BACKENDS:-1}" TEST_DB="$TEST_DB" MOCK="$MOCK" python3 -c "
import sys,json,os
d=json.load(sys.stdin)
d['metadata']={'name':'tyershop-backend-extra','namespace':'$NS','labels':{'loadtest':'extra'}}
d.pop('status',None)
d['spec']['replicas']=int(os.environ['EXTRA'])
sel={'app':'loadtest-backend'}
d['spec']['selector']={'matchLabels':sel}
d['spec']['template']['metadata']['labels']=sel
c=d['spec']['template']['spec']['containers'][0]
env={e['name']:e for e in c['env']}
for k,v in {'DATABASE_URL':os.environ['TEST_DB'],'LOAD_TEST_MODE':'true','MERCADOPAGO_API_BASE':os.environ['MOCK'],'MELHOR_ENVIO_BASE_URL':os.environ['MOCK'],'MELHOR_ENVIO_FROM_ZIP':'06365210'}.items():
    env[k]={'name':k,'value':v}
env.pop('NODE_OPTIONS',None)
c['env']=list(env.values())
c.setdefault('resources',{}).setdefault('requests',{})['cpu']='100m'
print(json.dumps(d))" | kubectl apply -f -
    kubectl -n "$NS" apply -f - <<SVC
apiVersion: v1
kind: Service
metadata: { name: loadtest-backend, namespace: $NS }
spec:
  selector: { app: loadtest-backend }
  ports: [{ port: 9000, targetPort: 9000 }]
SVC
  else
    kubectl -n argocd get app tyershop -o json | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['spec'].get('syncPolicy',{})))" > "$OUT/syncpolicy.json"
    kubectl -n argocd patch app tyershop --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
    kubectl -n "$NS" set env deploy/tyershop-backend LOAD_TEST_MODE=true MERCADOPAGO_API_BASE="$MOCK" MELHOR_ENVIO_BASE_URL="$MOCK" MELHOR_ENVIO_FROM_ZIP=06365210
  fi
  wait_backend
  backend npx medusa exec ./src/scripts/setup-melhor-envio-shipping.js 2>&1 | grep -iE "Melhor Envio|Frete fixo|Opções|rror" || true
  node_pg > "$OUT/estado-original.json" <<'JS'
const day=86400000, now=Date.now();
const rnd=()=>Array.from({length:26},()=> '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random()*32)]).join('');
await c.query("update drop set is_current=false where is_current");
const prods=(await c.query("select p.id from product p where p.status='published' and exists(select 1 from product_variant v where v.product_id=p.id and v.deleted_at is null) and p.deleted_at is null order by p.created_at limit 20")).rows.map(r=>r.id);
const dropId='drop_'+rnd();
await c.query("insert into drop (id,handle,title,is_current,preorder_starts_at,preorder_ends_at,general_starts_at,general_ends_at,general_lot,production_days,hero_kind,created_at,updated_at) values ($1,'carga-teste','Carga Teste',true,$2,$3,$4,$5,null,21,'banner',now(),now())",[dropId,new Date(now-3*day),new Date(now-2*day),new Date(now-2*day),new Date(now+30*day)]);
for (const pid of prods) await c.query("insert into drop_drop_product_product (drop_id,product_id,id) values ($1,$2,$3)",[dropId,pid,'dropprod_'+rnd()]);
const vars=(await c.query("select id,manage_inventory,allow_backorder from product_variant where product_id=any($1) and deleted_at is null",[prods])).rows;
await c.query("update product_variant set manage_inventory=false, allow_backorder=true where product_id=any($1)",[prods]);
const has=(await c.query("select 1 from melhor_envio_token where deleted_at is null limit 1")).rowCount>0;
let fake=false;
if(!has){await c.query("insert into melhor_envio_token (id,access_token,refresh_token,expires_at) values ($1,'token-de-carga','refresh-de-carga',now()+interval '20 days')",['metok_'+rnd()]);fake=true}
console.log(JSON.stringify({dropId,variants:vars,fakeToken:fake,products:prods.length}));
JS
  python3 -c "import sys,json;d=json.load(open('$OUT/estado-original.json'));print('drop',d['dropId'],'produtos',d['products'],'variantes',len(d['variants']))"
  ;;
run)
  PK=$(kubectl -n "$NS" exec deploy/tyershop-frontend -- printenv PUBLIC_MEDUSA_PUBLISHABLE_KEY)
  kubectl -n "$NS" create configmap loadtest-k6 --from-file=load.js="$HERE/k6/load.js" --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n "$NS" delete job loadtest-k6 --ignore-not-found
  export FRONT_URL="http://tyershop-frontend.$NS.svc.cluster.local" API_URL="http://$API_SVC.$NS.svc.cluster.local:9000" PUBLISHABLE_KEY="$PK"
  export PROFILE="${PROFILE:-capacity}" PEOPLE="${PEOPLE:-100,200,300}" HOLD_SECONDS="${HOLD_SECONDS:-300}" THINK_SCALE="${THINK_SCALE:-1}"
  export USERS="${USERS:-3000}" STEP_SECONDS="${STEP_SECONDS:-90}" LEVELS="${LEVELS:-20:2,50:5,100:10,200:20,400:40,700:100,1000:250,1000:500}"
  envsubst < "$HERE/k8s/k6-job.yaml" | kubectl apply -f -
  # amostra de uso a cada 10 s enquanto o teste roda
  ( until kubectl -n "$NS" get job loadtest-k6 -o jsonpath='{.status.succeeded}{.status.failed}' 2>/dev/null | grep -qE "[0-9]"; do
      echo "$(date -u +%H:%M:%S),$(kubectl top node --no-headers | awk '{print $2","$3","$4","$5}'),$(kubectl top pods -n $NS --no-headers 2>/dev/null | grep -E 'tyershop|loadtest' | awk '{printf "%s=%s/%s;",$1,$2,$3}')" >> "$OUT/uso.csv"
      sleep 10
    done ) &
  SAMPLER=$!
  until kubectl -n "$NS" get job loadtest-k6 -o jsonpath='{.status.succeeded}{.status.failed}' 2>/dev/null | grep -qE "[0-9]"; do sleep 10; done
  kubectl -n "$NS" logs job/loadtest-k6 --tail=-1 > "$OUT/k6.log" 2>&1 || true
  kill $SAMPLER 2>/dev/null || true
  grep -o '###RESULT###.*###END###' "$OUT/k6.log" | sed 's/###RESULT###//; s/###END###//' > "$OUT/resultado.json" || true
  echo "salvo em $OUT"
  ;;
down)
  kubectl -n "$NS" delete job loadtest-k6 loadtest-copia-banco --ignore-not-found
  kubectl -n "$NS" delete deploy tyershop-backend-extra loadtest-postgres loadtest-mock --ignore-not-found
  kubectl -n "$NS" delete svc loadtest-backend loadtest-postgres loadtest-mock --ignore-not-found
  kubectl -n "$NS" delete configmap loadtest-mock loadtest-k6 --ignore-not-found
  if [ "$ISOLATED" != "1" ]; then
    kubectl -n "$NS" set env deploy/tyershop-backend LOAD_TEST_MODE- MERCADOPAGO_API_BASE- MELHOR_ENVIO_BASE_URL-
    POLICY=$(cat "$OUT/syncpolicy.json")
    kubectl -n argocd patch app tyershop --type merge -p "{\"spec\":{\"syncPolicy\":$POLICY}}"
  fi
  echo "desmontado"
  ;;
*) echo "uso: $0 up|run|down"; exit 1 ;;
esac
