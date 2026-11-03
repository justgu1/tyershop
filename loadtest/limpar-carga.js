const { deleteProductsWorkflow } = require("@medusajs/medusa/core-flows");
const { Modules } = require("@medusajs/framework/utils");
// Tira do ambiente o que a carga criou: o produto fictício e os clientes e pedidos com e-mail da carga. Roda no backend: medusa exec.
const CARGA_EMAIL = /@carga-teste\.invalid$|^carga[+-].*@teste\.local$/i; // mesma regra de loadtest/k6/guards.js
exports.default = async function ({ container }) {
  const query = container.resolve("query");
  const log = (m) => console.log(m);

  const orders = (await query.graph({ entity: "order", fields: ["id", "email"], pagination: { take: 100000 } })).data.filter((o) => CARGA_EMAIL.test(String(o.email || "")));
  if (orders.length) await container.resolve(Modules.ORDER).deleteOrders(orders.map((o) => o.id));
  log(`pedidos removidos: ${orders.length}`);

  const customerModule = container.resolve(Modules.CUSTOMER);
  const authModule = container.resolve(Modules.AUTH);
  const customers = (await customerModule.listCustomers({}, { take: null })).filter((c) => CARGA_EMAIL.test(String(c.email || "")));
  for (let i = 0; i < customers.length; i += 200) {
    const batch = customers.slice(i, i + 200);
    const identities = await authModule.listAuthIdentities({ provider_identities: { entity_id: batch.map((c) => c.email), provider: "emailpass" } }, { take: null });
    if (identities.length) await authModule.deleteAuthIdentities(identities.map((a) => a.id));
    await customerModule.deleteCustomers(batch.map((c) => c.id));
  }
  log(`clientes removidos: ${customers.length}`);

  const product = (await query.graph({ entity: "product", fields: ["id"], filters: { handle: "camiseta-carga" } })).data[0];
  if (product) await deleteProductsWorkflow(container).run({ input: { ids: [product.id] } });
  log(`produto da carga removido: ${product ? "sim" : "não havia"}`);
};
