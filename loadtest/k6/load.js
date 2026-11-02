// Teste de carga do Tyer Shop (k6).  Meta: p99 < 1000 ms com 1000 req/s de navegação e 500 finalizações/s.
// Veja loadtest/README.md antes de rodar.
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const FRONT = (__ENV.FRONT_URL || "http://localhost:4321").replace(/\/$/, "");
const API = (__ENV.API_URL || FRONT).replace(/\/$/, "");
const PK = __ENV.PUBLISHABLE_KEY || "";
const PROFILE = __ENV.PROFILE || "smoke";
const USERS = Number(__ENV.USERS || 100);
const P99_MS = Number(__ENV.P99_MS || 1000);
const ZIP = "01310-100";
const HOST = __ENV.HOST_HEADER || "";

// Esta carga cria contas, carrinhos e pedidos de verdade: só roda em ambiente descartável.
if (__ENV.I_UNDERSTAND_THIS_CREATES_ORDERS !== "yes") {
  fail("Recusado: defina I_UNDERSTAND_THIS_CREATES_ORDERS=yes (ambiente descartável, nunca produção).");
}
if (/tyershop\.com/i.test(FRONT + API) && __ENV.ALLOW_TYERSHOP_HOST !== "yes") {
  fail("Recusado: homologação e produção usam o mesmo banco. Aponte para um ambiente de teste de carga.");
}
if (!PK) fail("Defina PUBLISHABLE_KEY (chave publicável da loja).");

const PROFILES = {
  // Valida o script e o ambiente com carga mínima.
  smoke: { browse: [{ duration: "30s", target: 5 }], checkout: [{ duration: "30s", target: 1 }] },
  // Sobe em degraus até a meta e segura para ver estabilidade.
  target: {
    browse: [
      { duration: "2m", target: 250 },
      { duration: "3m", target: 1000 },
      { duration: "10m", target: 1000 },
      { duration: "1m", target: 0 },
    ],
    checkout: [
      { duration: "2m", target: 100 },
      { duration: "3m", target: 500 },
      { duration: "10m", target: 500 },
      { duration: "1m", target: 0 },
    ],
  },
  // Descobre onde quebra: continua subindo além da meta.
  stress: {
    browse: [{ duration: "5m", target: 2000 }, { duration: "5m", target: 3000 }],
    checkout: [{ duration: "5m", target: 1000 }, { duration: "5m", target: 1500 }],
  },
};
// Degraus de capacidade: [req/s de navegação, finalizações/s]. Cada degrau segura a taxa por STEP_SECONDS.
const LEVELS = (__ENV.LEVELS || "20:2,50:5,100:10,200:20,400:40,700:100,1000:250,1000:500")
  .split(",")
  .map((l) => l.split(":").map(Number));
const STEP_SECONDS = Number(__ENV.STEP_SECONDS || 90);
const GAP_SECONDS = 15;

const scenario = (exec, stages, preAllocatedVUs, maxVUs, extra = {}) => ({
  executor: "ramping-arrival-rate",
  startRate: 1,
  timeUnit: "1s",
  stages,
  preAllocatedVUs,
  maxVUs,
  exec,
  ...extra,
});

const constantStep = (exec, rate, startTime, level, preAllocatedVUs, maxVUs) => ({
  executor: "constant-arrival-rate",
  rate,
  timeUnit: "1s",
  duration: `${STEP_SECONDS}s`,
  startTime: `${startTime}s`,
  preAllocatedVUs,
  maxVUs,
  exec,
  tags: { level },
});

// Perfil "sessions": N pessoas simultâneas, cada uma navegando e comprando em 3 a 5 minutos (tempo de leitura e de digitação
// entre as ações). PEOPLE="100,200,300" define os degraus; HOLD_SECONDS é quanto cada degrau fica estável.
const PEOPLE = (__ENV.PEOPLE || "100,200,300").split(",").map(Number);
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 300);
const RAMP_SECONDS = 60;
const THINK = Number(__ENV.THINK_SCALE || 1); // 1 = tempo de gente de verdade; 0.2 = sessões 5x mais curtas

let scenarios;
const thresholds = {};
if (PROFILE === "sessions") {
  scenarios = {};
  PEOPLE.forEach((n, i) => {
    const level = `P${n}`;
    const start = i * (RAMP_SECONDS + HOLD_SECONDS + 45);
    scenarios[`pessoas_${level}`] = {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [{ duration: `${RAMP_SECONDS}s`, target: n }, { duration: `${HOLD_SECONDS}s`, target: n }, { duration: "30s", target: 0 }],
      gracefulRampDown: "120s",
      startTime: `${start}s`,
      exec: "session",
      tags: { level, flow: "session" },
    };
    thresholds[`http_req_duration{level:${level}}`] = [`p(99)<${P99_MS}`];
    thresholds[`http_req_duration{level:${level},flow:checkout}`] = [`p(99)<${P99_MS}`];
    thresholds[`http_req_failed{level:${level}}`] = ["rate<0.01"];
    thresholds[`orders_completed{level:${level}}`] = ["count>=0"];
    thresholds[`session_ms{level:${level}}`] = ["p(99)<9999999"];
  });
  thresholds["http_req_failed"] = [{ threshold: "rate<0.5", abortOnFail: true, delayAbortEval: "60s" }];
} else if (PROFILE === "capacity") {
  scenarios = {};
  LEVELS.forEach(([browseRps, checkoutRps], i) => {
    const level = `L${i + 1}`;
    const start = i * (STEP_SECONDS + GAP_SECONDS);
    // Taxa 0 = esse fluxo não roda neste degrau (permite medir só navegação ou só finalização).
    if (browseRps > 0) scenarios[`browse_${level}`] = constantStep("browse", browseRps, start, level, Math.max(10, browseRps), Math.max(50, browseRps * 3));
    if (checkoutRps > 0) scenarios[`checkout_${level}`] = constantStep("checkout", checkoutRps, start, level, Math.max(10, checkoutRps * 3), Math.max(100, checkoutRps * 12));
    // Submétricas por degrau: aparecem no resumo e dizem em qual taxa a meta deixou de valer.
    thresholds[`http_req_duration{level:${level},flow:browse}`] = [`p(99)<${P99_MS}`];
    thresholds[`http_req_duration{level:${level},flow:checkout}`] = [`p(99)<${P99_MS}`];
    thresholds[`http_req_failed{level:${level},flow:browse}`] = ["rate<0.01"];
    thresholds[`http_req_failed{level:${level},flow:checkout}`] = ["rate<0.01"];
    thresholds[`checkout_total_ms{level:${level}}`] = ["p(99)<999999"];
    thresholds[`orders_completed{level:${level}}`] = ["count>=0"];
    thresholds[`dropped_iterations{level:${level}}`] = ["count>=0"];
  });
  // Freio de segurança: se quase tudo falha, para o teste em vez de martelar um servidor que já caiu.
  thresholds["http_req_failed"] = [{ threshold: "rate<0.5", abortOnFail: true, delayAbortEval: "30s" }];
} else {
  const profile = PROFILES[PROFILE] || fail(`PROFILE desconhecido: ${PROFILE}`);
  scenarios = {
    browse: scenario("browse", profile.browse, 200, 3000),
    checkout: scenario("checkout", profile.checkout, 500, 6000),
  };
  Object.assign(thresholds, {
    "http_req_duration{flow:browse}": [`p(99)<${P99_MS}`],
    "http_req_duration{flow:checkout}": [`p(99)<${P99_MS}`],
    "http_req_failed{flow:browse}": ["rate<0.01"],
    "http_req_failed{flow:checkout}": ["rate<0.01"],
    dropped_iterations: ["count<100"],
    orders_completed: ["count>0"],
    checks: ["rate>0.99"],
  });
}

export const options = {
  scenarios,
  thresholds,
  discardResponseBodies: false,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

const ordersCompleted = new Counter("orders_completed");
const checkoutTotal = new Trend("checkout_total_ms", true);
const step = (name) => new Trend(`step_${name}_ms`, true);
const steps = {
  cart: step("cart"), line: step("line_item"), address: step("address"), options: step("shipping_options"),
  method: step("shipping_method"), collection: step("payment_collection"), session: step("payment_session"),
  pay: step("pay"), complete: step("complete"),
};

const jsonHeaders = (token) => ({
  "content-type": "application/json",
  "x-publishable-api-key": PK,
  ...(HOST ? { host: HOST } : {}),
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

function post(url, body, token, tags) {
  return http.post(url, JSON.stringify(body), { headers: jsonHeaders(token), tags });
}

// Contas e catálogo preparados uma vez, antes da carga.
export function setup() {
  const region = http.get(`${API}/store/regions`, { headers: jsonHeaders() }).json("regions.0.id");
  const prods = http.get(`${API}/store/products?limit=50&fields=id,handle,*variants`, { headers: jsonHeaders() }).json("products") || [];
  const variants = prods.flatMap((p) => (p.variants || []).map((v) => v.id)).slice(0, 20);
  if (!region || !variants.length) fail("Sem região ou sem produtos à venda: rode prepare-loadtest.ts e confira o drop em venda geral.");

  const tokens = [];
  const stamp = Date.now();
  for (let i = 0; i < USERS; i += 20) {
    const batch = [];
    for (let j = i; j < Math.min(i + 20, USERS); j++) {
      const email = `carga+${stamp}-${j}@teste.local`;
      batch.push({ email, req: ["POST", `${API}/auth/customer/emailpass/register`, JSON.stringify({ email, password: "Carga#12345" }), { headers: jsonHeaders() }] });
    }
    const regs = http.batch(batch.map((b) => b.req));
    const creates = [];
    regs.forEach((r, k) => {
      const t = r.json("token");
      if (t) creates.push(["POST", `${API}/store/customers`, JSON.stringify({ email: batch[k].email }), { headers: jsonHeaders(t) }]);
    });
    http.batch(creates);
    const logins = http.batch(batch.map((b) => ["POST", `${API}/auth/customer/emailpass`, JSON.stringify({ email: b.email, password: "Carga#12345" }), { headers: jsonHeaders() }]));
    logins.forEach((r) => {
      const t = r.json("token");
      if (t) tokens.push(t);
    });
  }
  if (!tokens.length) fail("Nenhuma conta de teste criada.");
  return { region, variants, tokens };
}

const plain = () => (HOST ? { host: HOST } : {});
let reported = 0;
// Primeiras falhas de cada VU no log do k6: sem isso só se sabe que falhou, não por quê.
function note(step, res) {
  if (res.status >= 400 && reported < 3) {
    reported++;
    console.error(`FALHA ${step} ${res.status} ${String(res.body).slice(0, 220)}`);
  }
}
const pick = (list, n) => list[n % list.length];

// 1000 req/s: mistura do que o visitante faz.
export function browse(data) {
  const roll = Math.random();
  const tags = { flow: "browse" };
  if (roll < 0.35) {
    http.get(`${FRONT}/`, { headers: plain(), tags: { ...tags, page: "home" } });
  } else if (roll < 0.5) {
    http.get(`${FRONT}/drop`, { headers: plain(), tags: { ...tags, page: "drop" } });
  } else if (roll < 0.8) {
    http.get(`${API}/store/products?limit=12&region_id=${data.region}`, { headers: jsonHeaders(), tags: { ...tags, page: "catalog" } });
  } else if (roll < 0.9) {
    http.get(`${FRONT}/cart`, { headers: plain(), tags: { ...tags, page: "cart" } });
  } else {
    const res = post(`${API}/store/shipping/quote`, { postal_code: ZIP, items: [{ variant_id: pick(data.variants, __ITER), quantity: 1 }] }, null, { ...tags, page: "quote" });
    check(res, { "cotação 200": (r) => r.status === 200 });
  }
}

// 500 finalizações/s: o caminho completo até o pedido.
export function checkout(data) {
  const token = pick(data.tokens, (__VU * 7919 + __ITER) % data.tokens.length);
  const variant = pick(data.variants, __ITER + __VU);
  checkoutFlow(data, token, variant, false);
}

// `thinking`: pausa entre as etapas como uma pessoa preenchendo e conferindo os dados (perfil de sessões).
function checkoutFlow(data, token, variant, thinking) {
  const pause = () => { if (thinking) think(3, 9); };
  const tags = { flow: "checkout" };
  const started = Date.now();
  const time = (trend, res, name) => {
    trend.add(res.timings.duration);
    note(name || "etapa", res);
  };

  const cart = post(`${API}/store/carts`, { region_id: data.region }, token, { ...tags, step: "cart" });
  time(steps.cart, cart, "cart");
  const cartId = cart.json("cart.id");
  if (!check(cart, { "carrinho criado": () => !!cartId })) return;
  pause();

  const line = post(`${API}/store/carts/${cartId}/line-items`, { variant_id: variant, quantity: 1 }, token, { ...tags, step: "line_item" });
  time(steps.line, line, "line_item");
  if (!check(line, { "item adicionado": (r) => r.status === 200 })) return;
  pause();

  const addr = post(`${API}/store/carts/${cartId}`, {
    email: `carga@teste.local`,
    shipping_address: { first_name: "Carga", last_name: "Teste", address_1: "Av Paulista, 1", city: "São Paulo", province: "SP", postal_code: ZIP, country_code: "br" },
  }, token, { ...tags, step: "address" });
  time(steps.address, addr, "address");
  if (!check(addr, { "endereço salvo": (r) => r.status === 200 })) return;
  pause();

  const opts = http.get(`${API}/store/shipping-options?cart_id=${cartId}`, { headers: jsonHeaders(token), tags: { ...tags, step: "shipping_options" } });
  time(steps.options, opts, "shipping_options");
  const melhor = (opts.json("shipping_options") || []).filter((o) => o.provider_id === "melhorenvio_melhorenvio");
  // O simulador cota só alguns serviços: pega o primeiro que o endereço aceita (.Com, depois os demais).
  const option = melhor.find((o) => o.name === ".Com") || melhor[0];
  if (!check(opts, { "há opção de frete": () => !!option })) return;

  const method = post(`${API}/store/carts/${cartId}/shipping-methods`, { option_id: option.id }, token, { ...tags, step: "shipping_method" });
  time(steps.method, method, "shipping_method");
  if (!check(method, { "frete aplicado": (r) => r.status === 200 })) return;
  pause();

  const col = post(`${API}/store/payment-collections`, { cart_id: cartId }, token, { ...tags, step: "payment_collection" });
  time(steps.collection, col, "payment_collection");
  const colId = col.json("payment_collection.id");
  if (!check(col, { "coleção criada": () => !!colId })) return;

  const sess = post(`${API}/store/payment-collections/${colId}/payment-sessions`, { provider_id: "pp_mercadopago_mercadopago" }, token, { ...tags, step: "payment_session" });
  time(steps.session, sess, "payment_session");
  const sessions = sess.json("payment_collection.payment_sessions") || [];
  const sessionId = sessions.length ? sessions[sessions.length - 1].id : null;
  if (!check(sess, { "sessão criada": () => !!sessionId })) return;

  const pay = post(`${API}/store/checkout/mercadopago/card`, {
    payment_session_id: sessionId, token: "token-de-cartao", installments: 1, payer: { email: "carga@teste.local", cpf: "12345678909" },
  }, token, { ...tags, step: "pay" });
  time(steps.pay, pay, "pay");
  if (!check(pay, { "pagamento aprovado": (r) => r.status === 200 && r.json("status") === "approved" })) return;

  const done = post(`${API}/store/checkout/complete`, { cart_id: cartId }, token, { ...tags, step: "complete" });
  time(steps.complete, done, "complete");
  if (check(done, { "pedido criado": (r) => r.status === 200 && r.json("type") === "order" })) {
    ordersCompleted.add(1);
    checkoutTotal.add(Date.now() - started);
  }
}

const sessionMs = new Trend("session_ms", true);
const think = (min, max) => sleep((min + Math.random() * (max - min)) * THINK);

// Uma pessoa: lê a loja, olha produtos, calcula frete, preenche dados e paga. Em média 3 a 5 minutos.
export function session(data) {
  const started = Date.now();
  const tags = { flow: "browse" };
  const slot = (__VU * 7919 + __ITER) % data.tokens.length;
  const token = data.tokens[slot];
  const variant = pick(data.variants, __VU + __ITER);

  http.get(`${FRONT}/`, { headers: plain(), tags: { ...tags, page: "home" } });
  think(6, 15);
  http.get(`${FRONT}/drop`, { headers: plain(), tags: { ...tags, page: "drop" } });
  think(10, 25);
  http.get(`${API}/store/products?limit=12&region_id=${data.region}`, { headers: jsonHeaders(), tags: { ...tags, page: "catalog" } });
  think(10, 25);
  http.get(`${FRONT}/cart`, { headers: plain(), tags: { ...tags, page: "cart" } });
  think(5, 12);
  post(`${API}/store/shipping/quote`, { postal_code: ZIP, items: [{ variant_id: variant, quantity: 1 }] }, null, { ...tags, page: "quote" });
  think(15, 40); // decide e começa a preencher os dados
  checkoutFlow(data, token, variant, true);
  sessionMs.add(Date.now() - started);
}

export function handleSummary(data) {
  const pick = (m) => (m && m.values ? m.values : null);
  const levels = {};
  for (const [name, metric] of Object.entries(data.metrics)) {
    const m = name.match(/^([a-z_]+)\{level:([LP]\d+)(?:,flow:(\w+))?\}$/);
    if (!m) continue;
    const [, metricName, level, flow] = m;
    levels[level] = levels[level] || {};
    levels[level][`${metricName}${flow ? `.${flow}` : ""}`] = pick(metric);
  }
  const steps = {};
  for (const [name, metric] of Object.entries(data.metrics)) if (/^step_.*_ms$/.test(name) || name === "checkout_total_ms") steps[name] = pick(metric);
  const checks = (data.root_group.checks || []).map((c) => ({ name: c.name, passes: c.passes, fails: c.fails }));
  const compact = JSON.stringify({ levels, steps, checks, totals: { iterations: pick(data.metrics.iterations), dropped: pick(data.metrics.dropped_iterations), failed: pick(data.metrics.http_req_failed), req: pick(data.metrics.http_reqs) } });
  return { stdout: `\n###RESULT###${compact}###END###\n`, "loadtest/resultado.json": JSON.stringify(data, null, 2) };
}
