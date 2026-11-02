#!/usr/bin/env bash
# Teste de capacidade DENTRO do cluster (homologação). Reversível: `down` devolve tudo ao estado anterior.
#   loadtest/run-in-cluster.sh up      pausa o ArgoCD, sobe o simulador, aponta o backend para ele e prepara os dados
#   loadtest/run-in-cluster.sh run     roda o k6 (degraus de capacidade) e salva o resultado
#   loadtest/run-in-cluster.sh down    remove dados de teste, simulador e variáveis, e religa o ArgoCD
# Variáveis: USERS (padrão 3000), STEP_SECONDS (90), LEVELS ("20:2,50:5,...")
set -euo pipefail
NS=apps
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${OUT:-$HERE/saida}"
mkdir -p "$OUT"
backend() { kubectl -n "$NS" exec deploy/tyershop-backend -- "$@"; }
wait_backend() {
  kubectl -n "$NS" rollout status deploy/tyershop-backend --timeout=300s
}

node_pg() { # lê SQL/JS do stdin e roda no pod do backend com o pg já instalado
  kubectl -n "$NS" exec -i deploy/tyershop-backend -- node -e "
const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const fn=new Function('c', 'return (async()=>{' + require('fs').readFileSync(0,'utf8') + '})()');
try{await fn(c)}finally{await c.end()}})().catch(e=>{console.error('ERRO',e.message);process.exit(1)})"
}

case "${1:-}" in
up)
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/inicio.txt"
  kubectl -n argocd get app tyershop -o json | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['spec'].get('syncPolicy',{})))" > "$OUT/syncpolicy.json"
  kubectl -n argocd patch app tyershop --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
  kubectl -n "$NS" create configmap loadtest-mock --from-file=mock-gateways.mjs="$HERE/mock-gateways.mjs" --dry-run=client -o yaml | kubectl apply -f -
  kubectl apply -f "$HERE/k8s/mock.yaml"
  kubectl -n "$NS" rollout status deploy/loadtest-mock --timeout=120s
  kubectl -n "$NS" set env deploy/tyershop-backend LOAD_TEST_MODE=true \
    MERCADOPAGO_API_BASE=http://loadtest-mock.$NS.svc.cluster.local:8099 \
    MELHOR_ENVIO_BASE_URL=http://loadtest-mock.$NS.svc.cluster.local:8099 \
    MELHOR_ENVIO_FROM_ZIP=06365210
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
  cat "$OUT/estado-original.json" | python3 -c "import sys,json;d=json.load(sys.stdin);print('drop',d['dropId'],'produtos',d['products'],'variantes',len(d['variants']))"
  ;;
run)
  PK=$(kubectl -n "$NS" exec deploy/tyershop-frontend -- printenv PUBLIC_MEDUSA_PUBLISHABLE_KEY)
  kubectl -n "$NS" create configmap loadtest-k6 --from-file=load.js="$HERE/k6/load.js" --dry-run=client -o yaml | kubectl apply -f -
  kubectl -n "$NS" delete job loadtest-k6 --ignore-not-found
  export FRONT_URL="http://tyershop-frontend.$NS.svc.cluster.local" API_URL="http://tyershop-backend.$NS.svc.cluster.local:9000" PUBLISHABLE_KEY="$PK"
  export USERS="${USERS:-3000}" STEP_SECONDS="${STEP_SECONDS:-90}" LEVELS="${LEVELS:-20:2,50:5,100:10,200:20,400:40,700:100,1000:250,1000:500}"
  envsubst < "$HERE/k8s/k6-job.yaml" | kubectl apply -f -
  # amostra de CPU/memória a cada 10 s enquanto o teste roda
  ( while kubectl -n "$NS" get job loadtest-k6 -o jsonpath='{.status.active}' 2>/dev/null | grep -q 1 || [ ! -s "$OUT/uso.csv" ]; do
      echo "$(date -u +%H:%M:%S),$(kubectl top node --no-headers | awk '{print $2","$3","$4","$5}'),$(kubectl top pods -n $NS --no-headers 2>/dev/null | grep -E 'tyershop|loadtest' | awk '{printf "%s=%s/%s;",$1,$2,$3}')" >> "$OUT/uso.csv"
      sleep 10
    done ) &
  SAMPLER=$!
  until kubectl -n "$NS" get pod -l job-name=loadtest-k6 -o jsonpath='{.items[0].status.phase}' 2>/dev/null | grep -qE "Running|Succeeded|Failed"; do sleep 3; done
  # sem `logs -f`: o seguimento de logs estoura o limite de inotify do computador local em testes longos
  until kubectl -n "$NS" get job loadtest-k6 -o jsonpath='{.status.succeeded}{.status.failed}' 2>/dev/null | grep -qE "[0-9]"; do sleep 10; done
  kubectl -n "$NS" logs job/loadtest-k6 --tail=-1 > "$OUT/k6.log" 2>&1 || true
  kill $SAMPLER 2>/dev/null || true
  grep -o '###RESULT###.*###END###' "$OUT/k6.log" | sed 's/###RESULT###//; s/###END###//' > "$OUT/resultado.json" || true
  echo "salvo em $OUT"
  ;;
down)
  START=$(cat "$OUT/inicio.txt")
  # Dados criados pelo teste (contas carga+*, carrinhos, pagamentos, pedidos, execuções de workflow) desde o início.
  sed "s|__START__|$START|" <<'JS' | node_pg || true
const start=new Date('__START__');
const q=async(sql,args=[])=>{const r=await c.query(sql,args);return r.rowCount};
const out={};
out.orders=await q('delete from "order" where created_at>=$1',[start]);
out.payment_collections=await q('delete from payment_collection where created_at>=$1',[start]);
out.carts=await q('delete from cart where created_at>=$1',[start]);
await q("delete from auth_identity where id in (select auth_identity_id from provider_identity where entity_id like 'carga+%')");
out.customers=await q("delete from customer where email like 'carga+%'");
out.workflows=await q('delete from workflow_execution where created_at>=$1',[start]);
// tabelas de ligação (sem chave estrangeira) que ficaram apontando para registros apagados
const parents={cart_id:'cart',order_id:'"order"',payment_collection_id:'payment_collection'};
for(const [col,parent] of Object.entries(parents)){
  const t=await c.query("select table_name from information_schema.columns where table_schema='public' and column_name=$1 and table_name not like $2 and table_name<>$3",[col,col.replace('_id','')+'%',parent.replace(/\"/g,'')]);
  for(const {table_name} of t.rows){try{await c.query(`delete from "${table_name}" where ${col} is not null and ${col} not in (select id from ${parent})`)}catch(e){}}
}
console.log('LIMPEZA',JSON.stringify(out));
JS
  python3 - "$OUT/estado-original.json" <<'PY' | node_pg || true
import sys,json
st=json.load(open(sys.argv[1]))
v=json.dumps(st['variants'])
print("const vars=%s;"%v)
print("for (const x of vars) await c.query('update product_variant set manage_inventory=$2, allow_backorder=$3 where id=$1',[x.id,x.manage_inventory,x.allow_backorder]);")
print("await c.query(\"delete from drop_drop_product_product where drop_id=$1\",[%s]);"%json.dumps(st['dropId']))
print("await c.query('delete from drop where id=$1',[%s]);"%json.dumps(st['dropId']))
if st.get('fakeToken'): print("await c.query(\"delete from melhor_envio_token where access_token='token-de-carga'\");")
PY
  kubectl -n "$NS" set env deploy/tyershop-backend LOAD_TEST_MODE- MERCADOPAGO_API_BASE- MELHOR_ENVIO_BASE_URL-
  kubectl -n "$NS" delete job loadtest-k6 --ignore-not-found
  kubectl -n "$NS" delete deploy,svc loadtest-mock --ignore-not-found
  kubectl -n "$NS" delete configmap loadtest-mock loadtest-k6 --ignore-not-found
  POLICY=$(cat "$OUT/syncpolicy.json")
  kubectl -n argocd patch app tyershop --type merge -p "{\"spec\":{\"syncPolicy\":$POLICY}}"
  wait_backend
  echo "desmontado"
  ;;
*) echo "uso: $0 up|run|down"; exit 1 ;;
esac
