import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

// Peso em gramas e medidas em cm da peça embalada, dobrada e plana. O frete soma a altura de cada unidade e usa o maior
// comprimento e a maior largura, então "altura" é a espessura da peça, não a altura da roupa. Idempotente.
// Valores por tipo de peça (estimativa): conferir com a pesagem real antes de vender.
type Medidas = { weight: number; length: number; width: number; height: number };
const CAMISETA: Medidas = { weight: 200, length: 30, width: 25, height: 3 };
const CAMISETA_BOXY: Medidas = { weight: 300, length: 32, width: 26, height: 4 };
const REGATA: Medidas = { weight: 150, length: 30, width: 25, height: 2 };
const SHORTS: Medidas = { weight: 200, length: 30, width: 25, height: 3 };
const JAQUETA: Medidas = { weight: 500, length: 35, width: 28, height: 8 };
const CHAVEIRO: Medidas = { weight: 30, length: 16, width: 11, height: 3 };
const PULSEIRA: Medidas = { weight: 20, length: 16, width: 11, height: 2 };

const POR_PRODUTO: Record<string, Medidas> = {
  "camiseta-tyer-five-stars": CAMISETA,
  "camiseta-tyer-red-rose": CAMISETA,
  "camiseta-tyer-starter-dry-fit": CAMISETA,
  "tyer-savage-mode-1-dry-fit": CAMISETA,
  "tyer-savage-mode-2-dry-fit": CAMISETA,
  "camiseta-tyer-in-paris-boxy": CAMISETA_BOXY,
  mvp1: CAMISETA_BOXY,
  "regata-savage-mode": REGATA,
  "shorts-tyer-day-2k25-mbqip": SHORTS,
  "shorts-tyer-five-stars": SHORTS,
  "shorts-tyer-in-paris": SHORTS,
  "shorts-tyer-pro": SHORTS,
  "shorts-tyer-red-rose-dry-fit": SHORTS,
  tyertech: JAQUETA,
  "chaveiro-tyer-boy": CHAVEIRO,
  "chaveiro-tyer-five-stars-only": CHAVEIRO,
  "chaveiro-tyer-logo": CHAVEIRO,
  "pulseira-tyer": PULSEIRA,
};

export default async function ajustarFreteProdutos({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id"],
    filters: { handle: Object.keys(POR_PRODUTO) },
  });

  for (const product of data as any[]) {
    const medidas = POR_PRODUTO[product.handle];
    await productModule.updateProducts(product.id, medidas);
    for (const variant of product.variants ?? []) {
      await productModule.updateProductVariants(variant.id, medidas);
    }
    logger.info(`${product.handle}: ${(product.variants ?? []).length} variantes ajustadas`);
  }

  const sem = Object.keys(POR_PRODUTO).filter((h) => !(data as any[]).some((p) => p.handle === h));
  if (sem.length) logger.warn(`não encontrados neste ambiente: ${sem.join(", ")}`);
}
