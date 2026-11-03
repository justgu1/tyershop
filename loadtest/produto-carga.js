const { createProductsWorkflow } = require("@medusajs/medusa/core-flows");
const { Modules } = require("@medusajs/framework/utils");
// Cria (ou completa) o produto fictício da carga, com estoque alto, fora de qualquer drop. Roda no backend: medusa exec.
exports.default = async function ({ container }) {
  const query = container.resolve("query");
  const inv = container.resolve(Modules.INVENTORY);
  let product = (await query.graph({ entity: "product", fields: ["id"], filters: { handle: "camiseta-carga" } })).data[0];
  const ref = (await query.graph({ entity: "product", fields: ["shipping_profile.id", "sales_channels.id"], filters: { handle: "camiseta-tyer-starter-dry-fit" } })).data[0];
  const channels = (ref.sales_channels ?? []).map((s) => s.id);

  if (!product) {
    const img = "https://homolog.tyershop.com/produtos/tyer-starter/camiseta-preta/1.webp";
    const sizes = ["P", "M", "G"];
    const { result } = await createProductsWorkflow(container).run({
      input: { products: [{
        title: "Camiseta Carga", handle: "camiseta-carga", status: "published",
        description: "Produto fictício do teste de carga; sai do ar no fim do teste.",
        thumbnail: img, images: [{ url: img }], shipping_profile_id: ref.shipping_profile?.id, sales_channels: channels.map((id) => ({ id })),
        weight: 200, length: 30, width: 25, height: 3,
        options: [{ title: "Tamanho", values: sizes }],
        variants: sizes.map((s) => ({ title: s, sku: `carga-${s.toLowerCase()}`, options: { Tamanho: s }, manage_inventory: true, allow_backorder: false, weight: 200, length: 30, width: 25, height: 3, prices: [{ currency_code: "brl", amount: 49.9 }] })),
      }] },
    });
    product = result[0];
  }

  // O local de estoque precisa estar ligado ao canal de vendas do produto: pegar "qualquer um" deixaria as variantes indisponíveis.
  const locations = (await query.graph({ entity: "stock_location", fields: ["id", "sales_channels.id"] })).data;
  const loc = locations.find((l) => (l.sales_channels ?? []).some((s) => channels.includes(s.id)));
  if (!loc) throw new Error("nenhum local de estoque ligado ao canal de vendas do produto de referência");

  // Idempotente: completa só o estoque que falta (uma execução interrompida no meio não deixa o produto sem estoque).
  const variants = (await query.graph({ entity: "variant", fields: ["id", "inventory_items.inventory_item_id"], filters: { product_id: product.id } })).data;
  let created = 0;
  for (const v of variants) {
    const itemId = v.inventory_items[0].inventory_item_id;
    const has = await inv.listInventoryLevels({ inventory_item_id: itemId, location_id: loc.id }, { take: 1 });
    if (has.length) continue;
    await inv.createInventoryLevels([{ inventory_item_id: itemId, location_id: loc.id, stocked_quantity: 5000 }]);
    created++;
  }
  console.log("produto", product.id, "variantes", variants.length, "estoque criado em", created);
};
