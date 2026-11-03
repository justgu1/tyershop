import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, ProductStatus } from "@medusajs/framework/utils";
import { createProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";
import { DROP_MODULE } from "../modules/drop";
import { setDropProducts } from "../modules/drop/products";

// Horários em UTC (Brasília é UTC-3). Teste: aberto até 00:00 BRT de 03/11. Drop 6: 12:00 BRT de 03/11 até 00:00 BRT de 04/11.
const TESTE = { fim: "2026-11-03T03:00:00Z" };
const DROP6 = { inicio: "2026-11-03T15:00:00Z", fim: "2026-11-04T03:00:00Z" };
const PRODUTOS_DROP6 = ["camiseta-tyer-gang", "short-compressao-cacada", "calca-cacada", "regata-cacada", "pulseira-cacada"];

// Idempotente. Cria o Drop 6 (sem limite de estoque, libera quem se cadastra na pré-venda) e um drop de teste
// aberto agora com um produto de R$ 1,00 para exercitar o fluxo inteiro.
export default async function abrirPreVenda({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const drops = container.resolve(DROP_MODULE) as any;
  const productModule = container.resolve(Modules.PRODUCT);

  // Sem limite de estoque no Drop 6.
  const { data: gang } = await query.graph({ entity: "product", fields: ["id", "variants.id"], filters: { handle: "camiseta-tyer-gang" } });
  for (const v of (gang[0] as any)?.variants ?? []) await productModule.updateProductVariants(v.id, { manage_inventory: false });

  const { data: found } = await query.graph({ entity: "product", fields: ["id", "handle"], filters: { handle: [...PRODUTOS_DROP6, "produto-teste"] } });
  const idOf = new Map((found as any[]).map((p) => [p.handle, p.id as string]));

  const faltam = PRODUTOS_DROP6.filter((h) => !idOf.has(h));
  if (faltam.length) throw new Error(`produtos não encontrados: ${faltam.join(", ")}`);

  if (!idOf.has("produto-teste")) {
    const [salesChannel] = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({ name: "Default Sales Channel" });
    const [profile] = await container.resolve(Modules.FULFILLMENT).listShippingProfiles({ type: "default" });
    const { result } = await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: "Produto Teste",
            handle: "produto-teste",
            status: ProductStatus.PUBLISHED,
            weight: 100,
            shipping_profile_id: profile.id,
            options: [{ title: "Tamanho", values: ["Único"] }],
            variants: [
              {
                title: "Único",
                sku: "produto-teste-unico",
                options: { Tamanho: "Único" },
                manage_inventory: false,
                allow_backorder: false,
                weight: 100,
                prices: [{ amount: 1, currency_code: "brl" }],
              },
            ],
            sales_channels: [{ id: salesChannel.id }],
          },
        ],
      },
    });
    idOf.set("produto-teste", result[0].id);
  }

  // Os produtos do drop ficam publicados; enquanto o drop não vende, a API da loja os esconde de quem não tem acesso.
  await updateProductsWorkflow(container).run({
    input: { selector: { id: [...PRODUTOS_DROP6.map((h) => idOf.get(h)!), idOf.get("produto-teste")!] }, update: { status: ProductStatus.PUBLISHED } },
  });

  const agora = new Date();
  const [teste] = await drops.listDrops({ handle: "drop-teste" });
  const [drop6] = await drops.listDrops({ handle: "drop-6" });
  const testeRow =
    teste ??
    (await drops.createDrops({
      handle: "drop-teste",
      title: "Drop Teste",
      subtitle: "Teste do fluxo de compra",
      preorder_starts_at: new Date(agora.getTime() - 60_000),
      preorder_ends_at: new Date(TESTE.fim),
      general_ends_at: new Date(TESTE.fim),
      release_leads_in_presale: true,
      is_current: false,
    }));
  const drop6Row =
    drop6 ??
    (await drops.createDrops({
      handle: "drop-6",
      title: "Drop 6",
      subtitle: "Tyer Gang e Caçada",
      preorder_starts_at: new Date(DROP6.inicio),
      preorder_ends_at: new Date(DROP6.fim),
      general_ends_at: new Date(DROP6.fim),
      release_leads_in_presale: true,
      is_current: false,
    }));

  await setDropProducts(container, testeRow.id, [idOf.get("produto-teste")!]);
  await setDropProducts(container, drop6Row.id, PRODUTOS_DROP6.map((h) => idOf.get(h)!));
  await drops.makeCurrent(testeRow.id);

  logger.info(`drop-teste ${testeRow.id} (atual) e drop-6 ${drop6Row.id} criados`);
}
