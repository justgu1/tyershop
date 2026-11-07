import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";

// Tabela de medidas de cada peça: arquivo versionado em frontend/public/produtos, última imagem da galeria.
export const MEDIDAS: Record<string, string> = {
  "camiseta-tyer-gang": "exclusivos/tyer-gang/camiseta/medidas.webp",
  "short-compressao-cacada": "exclusivos/tyer-cacada/short-compressao/medidas.webp",
  "calca-cacada": "exclusivos/tyer-cacada/calca/medidas.webp",
  "regata-cacada": "exclusivos/tyer-cacada/regata/medidas.webp",
};

// Idempotente: a imagem de medidas fica sempre por último, sem duplicar.
export default async function medidasDrop6({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "images.url", "images.rank", "variants.id", "variants.metadata"],
    filters: { handle: Object.keys(MEDIDAS) },
  });
  for (const p of data as any[]) {
    const urls: string[] = [...(p.images ?? [])].sort((a, b) => a.rank - b.rank).map((i) => i.url);
    const origin = new URL(urls[0]).origin;
    const medidas = `${origin}/produtos/${MEDIDAS[p.handle]}`;
    const gallery = [...urls.filter((u) => u !== medidas), medidas];
    await updateProductsWorkflow(container).run({
      input: { selector: { id: p.id }, update: { images: gallery.map((url) => ({ url })) } },
    });
    // A página monta a galeria por variante a partir de `metadata.variant_gallery`: sem isso a imagem não aparece.
    for (const v of p.variants ?? []) {
      const own: unknown = v.metadata?.variant_gallery;
      if (!Array.isArray(own)) continue;
      const list = [...own.filter((u: string) => u !== medidas), medidas];
      await updateProductVariantsWorkflow(container).run({
        input: { selector: { id: v.id }, update: { metadata: { ...(v.metadata ?? {}), variant_gallery: list } } },
      });
    }
    logger.info(`${p.handle}: ${gallery.length} imagens, medidas por último`);
  }
  const achados = (data as any[]).map((p) => p.handle);
  const faltando = Object.keys(MEDIDAS).filter((h) => !achados.includes(h));
  if (faltando.length) logger.warn(`não achei: ${faltando.join(", ")}`);
}
