import { ExecArgs, CreateInventoryLevelInput } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  createInventoryLevelsWorkflow,
  createProductOptionsWorkflow,
  createProductVariantsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows";

// Imagens reais dos produtos, versionadas no repo em frontend/public/produtos/**
// (mesmo conteudo espelhado no MinIO como storage de upload/admin).
// URL absoluta pro host que serve o /public do frontend (Cloudflare na frente
// dele em producao, este host direto em dev) — funciona tanto no storefront
// quanto no admin do Medusa (outro origin), <img> nao sofre CORS.
const SITE_URL = process.env.PUBLIC_SITE_URL || "http://localhost:4321";

function range(folder: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${SITE_URL}/produtos/${folder}/${i + 1}.webp`);
}
function one(relPath: string): string {
  return `${SITE_URL}/produtos/${relPath}`;
}

type ImageEntry =
  | { byColor: Record<string, string[]> }
  | { images: string[] };

const PRODUCT_IMAGES: Record<string, ImageEntry> = {
  "camiseta-tyer-five-stars": {
    byColor: {
      Amarela: range("exclusivos/tyer-five-stars/camiseta-amarela", 7),
      Preta: range("exclusivos/tyer-five-stars/camiseta-preta", 8),
    },
  },
  "shorts-tyer-five-stars": {
    byColor: {
      Amarelo: range("exclusivos/tyer-five-stars/shorts-amarelo", 11),
      Preto: range("exclusivos/tyer-five-stars/shorts-preto", 7),
    },
  },
  "camiseta-tyer-red-rose": {
    byColor: {
      Vermelha: range("exclusivos/tyer-red-rose/camiseta-vermelha", 8),
      Preta: range("exclusivos/tyer-red-rose/camiseta-preta", 7),
    },
  },
  "regata-savage-mode": {
    byColor: {
      Preta: range("exclusivos/tyer-savage-mode/regata-preta", 8),
      Branca: range("exclusivos/tyer-savage-mode/regata-branca", 7),
    },
  },
  "shorts-tyer-day-2k25-mbqip": { images: range("exclusivos/tyer-day/shorts", 5) },
  "shorts-tyer-in-paris": { images: range("exclusivos/tyer-in-paris/shorts", 5) },
  "camiseta-tyer-in-paris-boxy": { images: range("exclusivos/tyer-in-paris/camiseta", 6) },
  // chaveiros: pasta unica com as 3 pecas + 1 foto de grupo (2.webp)
  "chaveiro-tyer-five-stars-only": {
    images: [one("accessorios/chaveiros/4.webp"), one("accessorios/chaveiros/2.webp")],
  },
  "chaveiro-tyer-boy": {
    images: [one("accessorios/chaveiros/3.webp"), one("accessorios/chaveiros/2.webp")],
  },
  "chaveiro-tyer-logo": {
    images: [one("accessorios/chaveiros/1.webp"), one("accessorios/chaveiros/2.webp")],
  },
  "shorts-tyer-pro": { images: range("tyer-pro/shorts", 5) },
  "tyer-savage-mode-2-dry-fit": { images: range("exclusivos/tyer-savage-mode/mode-2", 3) },
  tyertech: { images: range("tyer-tech/jaqueta", 7) },
  "pulseira-tyer": {
    byColor: {
      Preto: range("accessorios/pulseira-preta", 4),
      Branco: range("accessorios/pulseira-branca", 4),
    },
  },
  // unico produto sem opcao Cor no CSV original mas com fotos das duas cores
  // localmente -> vira produto com opcao Cor (Preta/Branca) neste script.
  "camiseta-tyer-starter-dry-fit": {
    byColor: {
      Preta: range("tyer-starter/camiseta-preta", 6),
      Branca: range("tyer-starter/camiseta-branca", 6),
    },
  },
  "shorts-tyer-starter-dry-fit": { images: range("tyer-starter/shorts", 5) },
  "shorts-tyer-red-rose-dry-fit": { images: range("exclusivos/tyer-red-rose/shorts", 5) },
  mvp1: { images: range("exclusivos/tyer-mvp/camiseta", 5) },
  "tyer-savage-mode-1-dry-fit": { images: range("exclusivos/tyer-savage-mode/mode-1", 7) },
  // treino-de-ferias-3-0-summer-edition: sem fotos locais (servico, nao produto fisico), mantem thumbnail atual.
};

export default async function assignProductImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "thumbnail",
      "options.id",
      "options.title",
      "options.values.value",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.metadata",
      "variants.options.value",
      "variants.options.option.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.weight",
      "variants.height",
      "variants.width",
      "variants.length",
      "variants.manage_inventory",
      "variants.allow_backorder",
    ],
  });

  for (const product of products) {
    const entry = PRODUCT_IMAGES[product.handle];
    if (!entry) continue;

    if ("images" in entry) {
      // Galeria unica pra todo o produto (sem variacao de cor nas fotos).
      const urls = entry.images;
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: product.id },
          update: {
            thumbnail: urls[0],
            images: urls.map((url) => ({ url })),
          },
        },
      });
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: (product.variants || []).map((v: any) => ({
            id: v.id,
            thumbnail: urls[0],
            metadata: { ...(v.metadata || {}), variant_gallery: urls },
          })),
        },
      });
      logger.info(`Imagens (galeria unica) aplicadas: ${product.handle} (${urls.length} fotos)`);
      continue;
    }

    // entry tem byColor
    const byColor = entry.byColor;
    const allUrls = Array.from(new Set(Object.values(byColor).flat()));

    const hasCorOption = (product.options || []).some((o: any) => o.title === "Cor");

    if (!hasCorOption) {
      // Caso especial: produto so tinha Tamanho, precisa ganhar a opcao Cor
      // e duplicar os variants existentes pras duas cores.
      const colorValues = Object.keys(byColor);
      logger.info(
        `Produto sem opcao Cor, criando (${colorValues.join("/")}) e duplicando variants: ${product.handle}`
      );

      await createProductOptionsWorkflow(container).run({
        input: {
          product_options: [{ title: "Cor", values: colorValues, product_id: product.id }],
        },
      });

      const existingVariants = product.variants || [];
      const firstColor = colorValues[0];
      const otherColors = colorValues.slice(1);

      // Variants existentes assumem a primeira cor.
      await updateProductVariantsWorkflow(container).run({
        input: {
          product_variants: existingVariants.map((v: any) => {
            const sizeOpt = (v.options || []).find(
              (o: any) => o.option?.title === "Tamanho"
            );
            const size = sizeOpt?.value;
            const urls = byColor[firstColor];
            return {
              id: v.id,
              title: `${firstColor} / ${size}`,
              options: { Tamanho: size, Cor: firstColor },
              thumbnail: urls[0],
              metadata: { ...(v.metadata || {}), variant_gallery: urls },
            };
          }),
        },
      });

      // Cria variants novos pras cores restantes, clonando preco/dimensoes do irmao.
      for (const color of otherColors) {
        const urls = byColor[color];
        const newVariants = existingVariants.map((v: any) => {
          const sizeOpt = (v.options || []).find(
            (o: any) => o.option?.title === "Tamanho"
          );
          const size = sizeOpt?.value;
          return {
            title: `${color} / ${size}`,
            sku: `${v.sku}-${color.toLowerCase()}`,
            options: { Tamanho: size, Cor: color },
            manage_inventory: v.manage_inventory,
            allow_backorder: v.allow_backorder,
            weight: v.weight ?? undefined,
            height: v.height ?? undefined,
            width: v.width ?? undefined,
            length: v.length ?? undefined,
            thumbnail: urls[0],
            metadata: { variant_gallery: urls },
            prices: (v.prices || []).map((p: any) => ({
              amount: p.amount,
              currency_code: p.currency_code,
            })),
          };
        });
        await createProductVariantsWorkflow(container).run({
          input: { product_variants: newVariants.map((v) => ({ ...v, product_id: product.id })) },
        });
      }

      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: product.id },
          update: { thumbnail: allUrls[0], images: allUrls.map((url) => ({ url })) },
        },
      });

      logger.info(`Opcao Cor + variants criados pra: ${product.handle}`);
      continue;
    }

    // Produto ja tem opcao Cor: so atualiza galeria por variante existente.
    await updateProductsWorkflow(container).run({
      input: {
        selector: { id: product.id },
        update: { thumbnail: allUrls[0], images: allUrls.map((url) => ({ url })) },
      },
    });

    const variantUpdates = (product.variants || [])
      .map((v: any) => {
        const colorOpt = (v.options || []).find((o: any) => o.option?.title === "Cor");
        const color = colorOpt?.value;
        const urls = color ? byColor[color] : undefined;
        if (!urls) return null;
        return {
          id: v.id,
          thumbnail: urls[0],
          metadata: { ...(v.metadata || {}), variant_gallery: urls },
        };
      })
      .filter(Boolean) as any[];

    if (variantUpdates.length) {
      await updateProductVariantsWorkflow(container).run({
        input: { product_variants: variantUpdates },
      });
    }
    logger.info(`Imagens (por cor) aplicadas: ${product.handle} (${allUrls.length} fotos)`);
  }

  // Garante nivel de estoque pros variants novos (starter branca).
  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });
  const stockLocation = stockLocations.find((l: any) => l.name === "Estoque Principal");
  if (stockLocation) {
    const { data: inventoryItems } = await query.graph({
      entity: "inventory_item",
      fields: ["id"],
    });
    const { data: existingLevels } = await query.graph({
      entity: "inventory_level",
      fields: ["inventory_item_id"],
      filters: { location_id: stockLocation.id },
    });
    const hasLevel = new Set(existingLevels.map((l: any) => l.inventory_item_id));
    const newLevels: CreateInventoryLevelInput[] = inventoryItems
      .filter((item: any) => !hasLevel.has(item.id))
      .map((item: any) => ({
        location_id: stockLocation.id,
        stocked_quantity: 100,
        inventory_item_id: item.id,
      }));
    if (newLevels.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: newLevels },
      });
      logger.info(`Estoque criado pra ${newLevels.length} variant(s) novo(s).`);
    }
  }

  logger.info("Imagens dos produtos aplicadas.");
}
