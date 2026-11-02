// Teste de carga do Tyer Shop (k6).  Meta: p99 < 1000 ms com 1000 req/s de navegação e 500 finalizações/s.
// Veja loadtest/README.md antes de rodar.
import http from "k6/http";
import { check, fail } from "k6";
import { Trend, Counter } from "k6/metrics";

const FRONT = (__ENV.FRONT_URL || "http://localhost:4321").replace(/\/$/, "");
const API = (__ENV.API_URL || FRONT).replace(/\/$/, "");
const PK = __ENV.PUBLISHABLE_KEY || "";
const PROFILE = __ENV.PROFILE || "smoke";
const USERS = Number(__ENV.USERS || 100);
const P99_MS = Number(__ENV.P99_MS || 1000);
const ZIP = "01310-100";

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
const profile = PROFILES[PROFILE] || fail(`PROFILE desconhecido: ${PROFILE}`);

const scenario = (exec, stages, preAllocatedVUs, maxVUs) => ({
  executor: "ramping-arrival-rate",
  startRate: 1,
  timeUnit: "1s",
  stages,
  preAllocatedVUs,
  maxVUs,
  exec,
});

export const options = {
  scenarios: {
    browse: scenario("browse", profile.browse, 200, 3000),
    checkout: scenario("checkout", profile.checkout, 500, 6000),
  },
  thresholds: {
    // Meta: 99% das requisições abaixo de P99_MS, nos dois fluxos.
    "http_req_duration{flow:browse}": [`p(99)<${P99_MS}`],
    "http_req_duration{flow:checkout}": [`p(99)<${P99_MS}`],
    "http_req_failed{flow:browse}": ["rate<0.01"],
    "http_req_failed{flow:checkout}": ["rate<0.01"],
    // O gerador conseguiu manter a taxa pedida (iterações que não puderam começar contam como falha de capacidade).
    dropped_iterations: ["count<100"],
    // Finalização de ponta a ponta (todas as etapas) também precisa fechar a meta de pedidos.
    orders_completed: ["count>0"],
    checks: ["rate>0.99"],
  },
  discardResponseBodies: false,
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

const pick = (list, n) => list[n % list.length];

// 1000 req/s: mistura do que o visitante faz.
export function browse(data) {
  const roll = Math.random();
  const tags = { flow: "browse" };
  if (roll < 0.35) {
    http.get(`${FRONT}/`, { tags: { ...tags, page: "home" } });
  } else if (roll < 0.5) {
    http.get(`${FRONT}/drop`, { tags: { ...tags, page: "drop" } });
  } else if (roll < 0.8) {
    http.get(`${API}/store/products?limit=12&region_id=${data.region}`, { headers: jsonHeaders(), tags: { ...tags, page: "catalog" } });
  } else if (roll < 0.9) {
    http.get(`${FRONT}/cart`, { tags: { ...tags, page: "cart" } });
  } else {
    const res = post(`${API}/store/shipping/quote`, { postal_code: ZIP, items: [{ variant_id: pick(data.variants, __ITER), quantity: 1 }] }, null, { ...tags, page: "quote" });
    check(res, { "cotação 200": (r) => r.status === 200 });
  }
}

// 500 finalizações/s: o caminho completo até o pedido.
export function checkout(data) {
  const token = pick(data.tokens, (__VU * 7919 + __ITER) % data.tokens.length);
  const variant = pick(data.variants, __ITER + __VU);
  const tags = { flow: "checkout" };
  const started = Date.now();
  const time = (trend, res) => trend.add(res.timings.duration);

  const cart = post(`${API}/store/carts`, { region_id: data.region }, token, { ...tags, step: "cart" });
  time(steps.cart, cart);
  const cartId = cart.json("cart.id");
  if (!check(cart, { "carrinho criado": () => !!cartId })) return;

  const line = post(`${API}/store/carts/${cartId}/line-items`, { variant_id: variant, quantity: 1 }, token, { ...tags, step: "line_item" });
  time(steps.line, line);
  if (!check(line, { "item adicionado": (r) => r.status === 200 })) return;

  const addr = post(`${API}/store/carts/${cartId}`, {
    email: `carga@teste.local`,
    shipping_address: { first_name: "Carga", last_name: "Teste", address_1: "Av Paulista, 1", city: "São Paulo", province: "SP", postal_code: ZIP, country_code: "br" },
  }, token, { ...tags, step: "address" });
  time(steps.address, addr);
  if (!check(addr, { "endereço salvo": (r) => r.status === 200 })) return;

  const opts = http.get(`${API}/store/shipping-options?cart_id=${cartId}`, { headers: jsonHeaders(token), tags: { ...tags, step: "shipping_options" } });
  time(steps.options, opts);
  const option = (opts.json("shipping_options") || []).find((o) => o.provider_id === "melhorenvio_melhorenvio");
  if (!check(opts, { "há opção de frete": () => !!option })) return;

  const method = post(`${API}/store/carts/${cartId}/shipping-methods`, { option_id: option.id }, token, { ...tags, step: "shipping_method" });
  time(steps.method, method);
  if (!check(method, { "frete aplicado": (r) => r.status === 200 })) return;

  const col = post(`${API}/store/payment-collections`, { cart_id: cartId }, token, { ...tags, step: "payment_collection" });
  time(steps.collection, col);
  const colId = col.json("payment_collection.id");
  if (!check(col, { "coleção criada": () => !!colId })) return;

  const sess = post(`${API}/store/payment-collections/${colId}/payment-sessions`, { provider_id: "pp_mercadopago_mercadopago" }, token, { ...tags, step: "payment_session" });
  time(steps.session, sess);
  const sessions = sess.json("payment_collection.payment_sessions") || [];
  const sessionId = sessions.length ? sessions[sessions.length - 1].id : null;
  if (!check(sess, { "sessão criada": () => !!sessionId })) return;

  const pay = post(`${API}/store/checkout/mercadopago/card`, {
    payment_session_id: sessionId, token: "token-de-cartao", installments: 1, payer: { email: "carga@teste.local", cpf: "12345678909" },
  }, token, { ...tags, step: "pay" });
  time(steps.pay, pay);
  if (!check(pay, { "pagamento aprovado": (r) => r.status === 200 && r.json("status") === "approved" })) return;

  const done = post(`${API}/store/carts/${cartId}/complete`, {}, token, { ...tags, step: "complete" });
  time(steps.complete, done);
  if (check(done, { "pedido criado": (r) => r.status === 200 && r.json("type") === "order" })) {
    ordersCompleted.add(1);
    checkoutTotal.add(Date.now() - started);
  }
}

export function handleSummary(data) {
  return { "loadtest/resultado.json": JSON.stringify(data, null, 2) };
}
