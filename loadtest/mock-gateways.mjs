// Simulador do Mercado Pago e do Melhor Envio para o teste de carga: aprova todo pagamento e cota um frete fixo.
// Uso: node loadtest/mock-gateways.mjs   (porta 8099, ou PORT=...)
import { createServer } from "node:http";

const payments = new Map();
let nextId = 1_000_000;

const json = (res, status, body) => {
  const raw = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(raw) });
  res.end(raw);
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "{}") : {};
  const url = new URL(req.url, "http://x");

  if (req.method === "POST" && url.pathname === "/v1/payments") {
    const id = nextId++;
    const payment = {
      id,
      status: "approved",
      status_detail: "accredited",
      transaction_amount: body.transaction_amount,
      external_reference: body.external_reference,
      point_of_interaction: { transaction_data: { qr_code: "000201", qr_code_base64: "" } },
    };
    payments.set(String(id), payment);
    return json(res, 201, payment);
  }
  const m = url.pathname.match(/^\/v1\/payments\/(\d+)(\/refunds)?$/);
  if (m && req.method === "GET") return payments.has(m[1]) ? json(res, 200, payments.get(m[1])) : json(res, 404, { message: "not found" });
  if (m && req.method === "PUT") {
    const p = payments.get(m[1]);
    if (p) p.status = body.status ?? p.status;
    return json(res, 200, p ?? {});
  }
  if (req.method === "POST" && url.pathname === "/api/v2/me/shipment/calculate") {
    return json(res, 200, [
      { id: 3, name: ".Package", price: "14.94", custom_price: "14.94", delivery_time: 7, delivery_range: { min: 6, max: 8 }, company: { name: "Jadlog" } },
      { id: 4, name: ".Com", price: "12.46", custom_price: "12.46", delivery_time: 6, delivery_range: { min: 5, max: 7 }, company: { name: "Jadlog" } },
    ]);
  }
  json(res, 404, { message: "rota não simulada" });
}).listen(Number(process.env.PORT) || 8099, "0.0.0.0", () => console.log("simulador no ar"));
