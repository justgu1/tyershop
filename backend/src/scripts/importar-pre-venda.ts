import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";

// Importa data/import-pre-venda.csv sempre em rascunho: fora de um drop, produto publicado apareceria para todos.
// Idempotente por handle. Depois: colecoes-pre-venda.ts, ajustar-frete-produtos.ts e assign-product-images.ts.
export default async function importarPreVenda({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillment = container.resolve(Modules.FULFILLMENT);

  const [salesChannel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Default Sales Channel" });
  const [profile] = await fulfillment.listShippingProfiles({ type: "default" });
  if (!salesChannel || !profile) throw new Error("rode setup-producao.ts antes: faltam canal de vendas ou perfil de frete");

  const rows: Record<string, string>[] = parse(fs.readFileSync(path.join(process.cwd(), "data", "import-pre-venda.csv"), "utf-8"), {
    columns: true,
    skip_empty_lines: true,
  });
  const byHandle = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const handle = row["Product Handle"]?.trim();
    if (handle) byHandle.set(handle, [...(byHandle.get(handle) ?? []), row]);
  }

  const { data: existing } = await query.graph({ entity: "product", fields: ["handle"] });
  const have = new Set((existing as { handle: string }[]).map((p) => p.handle));

  const products: any[] = [];
  for (const [handle, variantRows] of byHandle) {
    if (have.has(handle)) {
      logger.info(`já existe, pulando: ${handle}`);
      continue;
    }
    const head = variantRows[0];
    const name = variantRows[0]["Variant Option 1 Name"];
    products.push({
      title: head["Product Title"],
      handle,
      status: ProductStatus.DRAFT,
      weight: Number(head["Product Weight"]) || undefined,
      discountable: head["Product Discountable"] !== "FALSE",
      shipping_profile_id: profile.id,
      options: [{ title: name, values: variantRows.map((r) => r["Variant Option 1 Value"]) }],
      variants: variantRows.map((r) => ({
        title: r["Variant Title"],
        sku: r["Variant SKU"] || undefined,
        options: { [name]: r["Variant Option 1 Value"] },
        manage_inventory: r["Variant Manage Inventory"] === "TRUE",
        allow_backorder: r["Variant Allow Backorder"] === "TRUE",
        weight: Number(r["Variant Weight"]) || undefined,
        prices: [{ amount: Number(r["Variant Price BRL"]), currency_code: "brl" }],
      })),
      sales_channels: [{ id: salesChannel.id }],
    });
  }

  if (products.length) await createProductsWorkflow(container).run({ input: { products } });
  logger.info(`${products.length} produto(s) criado(s) em rascunho`);
}
