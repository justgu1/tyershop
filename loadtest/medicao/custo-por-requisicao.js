// Custo de CPU do servidor por requisição, medido por dentro do pod (lê /proc do processo `medusa start`).
// Uso: kubectl -n apps exec -i deploy/tyershop-backend -- node - <CHAVE_PUBLICAVEL> < loadtest/medicao/custo-por-requisicao.js
const fs=require("fs");
const PK=process.argv[2];
const pid=fs.readdirSync("/proc").filter(d=>/^\d+$/.test(d)).find(d=>{try{return fs.readFileSync(`/proc/${d}/cmdline`,"utf8").includes("medusa\0start")&&fs.readFileSync(`/proc/${d}/cmdline`,"utf8").startsWith("node")}catch{return false}});
const cpu=()=>{const f=fs.readFileSync(`/proc/${pid}/stat`,"utf8").split(") ")[1].split(" ");return (Number(f[11])+Number(f[12]))*10}; // ms
const H={"x-publishable-api-key":PK,"content-type":"application/json"};
const API="http://localhost:9000", FRONT="http://tyershop-frontend.apps.svc.cluster.local";
async function bench(name,fn,n=60){await fn();const c0=cpu(),t0=Date.now();for(let i=0;i<n;i++)await fn();const dt=(Date.now()-t0)/n,dc=(cpu()-c0)/n;console.log(`${name.padEnd(34)} ${dc.toFixed(1).padStart(7)} ms CPU/req   ${dt.toFixed(0).padStart(5)} ms/req  => ~${(1000/Math.max(dc,0.1)).toFixed(0)} req/s por núcleo`)}
const get=(u,h=H)=>async()=>{const r=await fetch(u,{headers:h});await r.text();return r};
(async()=>{
 const VAR=(await (await fetch(API+"/store/products?limit=1&fields=*variants",{headers:H})).json()).products[0].variants[0].id;
 console.log("pid do servidor",pid);
 await bench("GET /health",get(API+"/health",{}));
 await bench("GET /store/regions",get(API+"/store/regions"));
 await bench("GET /store/collections",get(API+"/store/collections?limit=50"));
 await bench("GET /store/drop",get(API+"/store/drop"));
 await bench("GET /store/products?limit=12",get(API+"/store/products?limit=12"));
 await bench("POST /store/shipping/quote",async()=>{const r=await fetch(API+"/store/shipping/quote",{method:"POST",headers:H,body:JSON.stringify({postal_code:"01310-100",items:[{variant_id:VAR,quantity:1}]})});await r.text()});
 const reg=(await (await fetch(API+"/store/regions",{headers:H})).json()).regions[0].id;
 await bench("POST /store/carts",async()=>{const r=await fetch(API+"/store/carts",{method:"POST",headers:H,body:JSON.stringify({region_id:reg})});await r.text()},40);
 await bench("PÁGINA / (SSR + fan-out)",get(FRONT+"/",{}),30);
 await bench("PÁGINA /drop",get(FRONT+"/drop",{}),30);
 await bench("PÁGINA /cart",get(FRONT+"/cart",{}),30);
})().catch(e=>console.log("ERR",e));
