import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";
import { medidasPorUltimo, NOVAS, renomear, RENOMEADAS } from "./medidas-galeria-regras";

// Idempotente.
export default async function medidasGaleria({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const handles = [...Object.keys(NOVAS), ...Object.keys(RENOMEADAS)];
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "images.url", "images.rank", "variants.id", "variants.metadata"],
    filters: { handle: handles },
  });
  for (const p of data as any[]) {
    const atuais: string[] = [...(p.images ?? [])].sort((a, b) => a.rank - b.rank).map((i) => i.url);
    const nova = NOVAS[p.handle] ? `${new URL(atuais[0]).origin}/produtos/${NOVAS[p.handle]}` : null;
    const galeria = nova ? [...atuais.filter((u) => u !== nova), nova] : atuais.map((u) => renomear(p.handle, u));
    await updateProductsWorkflow(container).run({
      input: { selector: { id: p.id }, update: { images: galeria.map((url) => ({ url })) } },
    });
    // A página monta a galeria por variante a partir de `metadata.variant_gallery`.
    for (const v of p.variants ?? []) {
      const propria: unknown = v.metadata?.variant_gallery;
      if (!Array.isArray(propria)) continue;
      const lista = nova ? medidasPorUltimo([...propria.filter((u: string) => u !== nova), nova]) : medidasPorUltimo(propria.map((u: string) => renomear(p.handle, u)));
      await updateProductVariantsWorkflow(container).run({
        input: { selector: { id: v.id }, update: { metadata: { ...(v.metadata ?? {}), variant_gallery: lista } } },
      });
    }
    logger.info(`${p.handle}: ${nova ? "tabela adicionada" : "tabela renomeada"}`);
  }
  const achados = (data as any[]).map((p) => p.handle);
  const faltando = handles.filter((h) => !achados.includes(h));
  if (faltando.length) logger.warn(`não achei: ${faltando.join(", ")}`);
}
