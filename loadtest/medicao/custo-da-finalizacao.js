// CPU do servidor em cada etapa de uma finalização completa (15 repetições). Precisa do simulador e de um drop em venda geral.
// Uso: kubectl -n apps exec -i deploy/tyershop-backend -- node - <CHAVE_PUBLICAVEL> < loadtest/medicao/custo-da-finalizacao.js
const fs=require("fs");const PK=process.argv[2];
const pid=fs.readdirSync("/proc").filter(d=>/^\d+$/.test(d)).find(d=>{try{const c=fs.readFileSync(`/proc/${d}/cmdline`,"utf8");return c.startsWith("node")&&c.includes("medusa\0start")}catch{return false}});
const cpu=()=>{const f=fs.readFileSync(`/proc/${pid}/stat`,"utf8").split(") ")[1].split(" ");return (Number(f[11])+Number(f[12]))*10};
const API="http://localhost:9000";const H=(t)=>({"x-publishable-api-key":PK,"content-type":"application/json",...(t?{authorization:"Bearer "+t}:{})});
const acc={};
async function call(step,m,p,b,t){const c0=cpu(),t0=Date.now();const r=await fetch(API+p,{method:m,headers:H(t),body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));const a=acc[step]||(acc[step]={cpu:0,ms:0,n:0,bad:0});a.cpu+=cpu()-c0;a.ms+=Date.now()-t0;a.n++;if(r.status>=400)a.bad++;return j}
(async()=>{
 const email=`carga+flow${Date.now()}@teste.local`;
 const t=(await call("(conta)","POST","/auth/customer/emailpass/register",{email,password:"Carga#12345"})).token;
 await call("(conta)","POST","/store/customers",{email},t);
 const tok=(await call("(conta)","POST","/auth/customer/emailpass",{email,password:"Carga#12345"})).token;
 const reg=(await call("regions","GET","/store/regions")).regions[0].id;
 const variant=(await call("produtos","GET","/store/products?limit=1&fields=*variants")).products[0].variants[0].id;
 for(let i=0;i<15;i++){
  const cart=(await call("1 criar carrinho","POST","/store/carts",{region_id:reg},tok)).cart.id;
  await call("2 adicionar item","POST",`/store/carts/${cart}/line-items`,{variant_id:variant,quantity:1},tok);
  await call("3 endereço+e-mail","POST",`/store/carts/${cart}`,{email:"c@t.local",shipping_address:{first_name:"C",last_name:"T",address_1:"Av P, 1",city:"SP",province:"SP",postal_code:"01310-100",country_code:"br"}},tok);
  const opts=(await call("4 opções de frete","GET",`/store/shipping-options?cart_id=${cart}`,null,tok)).shipping_options||[];
  const o=opts.find(x=>x.name===".Com")||opts[0];
  await call("5 aplicar frete","POST",`/store/carts/${cart}/shipping-methods`,{option_id:o.id},tok);
  const pc=(await call("6 coleção de pagamento","POST","/store/payment-collections",{cart_id:cart},tok)).payment_collection.id;
  const ss=(await call("7 sessão de pagamento","POST",`/store/payment-collections/${pc}/payment-sessions`,{provider_id:"pp_mercadopago_mercadopago"},tok)).payment_collection.payment_sessions.slice(-1)[0].id;
  await call("8 pagar (cartão)","POST","/store/checkout/mercadopago/card",{payment_session_id:ss,token:"t",installments:1,payer:{email:"c@t.local",cpf:"12345678909"}},tok);
  await call("9 concluir pedido","POST",`/store/carts/${cart}/complete`,{},tok);
 }
 let tot=0;
 for(const [k,a] of Object.entries(acc).sort()){ if(/^\d/.test(k)){tot+=a.cpu/a.n}
  console.log(k.padEnd(26),(a.cpu/a.n).toFixed(1).padStart(7),"ms CPU",(a.ms/a.n).toFixed(0).padStart(6),"ms/req","falhas",a.bad)}
 console.log("TOTAL por finalização".padEnd(26),tot.toFixed(0).padStart(7),"ms CPU  => ~"+(1000/tot).toFixed(1)+" finalizações/s por núcleo");
})().catch(e=>console.log("ERR",e));
