import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows";

// Regra da loja: a última imagem da galeria é a tabela de medidas, em um arquivo chamado `medidas.webp` (o link «Ver medidas» o acha por esse nome).

/** Peças que ganharam a tabela: arquivo versionado em frontend/public/produtos, colocado por último. */
export const NOVAS: Record<string, string> = {
  "camiseta-tyer-gang": "exclusivos/tyer-gang/camiseta/medidas.webp",
  "short-compressao-cacada": "exclusivos/tyer-cacada/short-compressao/medidas.webp",
  "calca-cacada": "exclusivos/tyer-cacada/calca/medidas.webp",
  "regata-cacada": "exclusivos/tyer-cacada/regata/medidas.webp",
};

/** Peças que já tinham a tabela como foto numerada: o arquivo passou a se chamar `medidas.webp`. */
export const RENOMEADAS: Record<string, [RegExp, string][]> = {
  "camiseta-tyer-starter-dry-fit": [
    [/\/camiseta-preta\/6\.webp$/, "/camiseta-preta/medidas.webp"],
    [/\/camiseta-branca\/6\.webp$/, "/camiseta-branca/medidas.webp"],
  ],
  "regata-savage-mode": [
    [/\/regata-preta\/8\.webp$/, "/regata-preta/medidas.webp"],
    [/\/regata-branca\/7\.webp$/, "/regata-branca/medidas.webp"],
  ],
  tyertech: [[/\/jaqueta\/7\.webp$/, "/jaqueta/medidas.webp"]],
};

export const isMedidas = (url: string) => /\/medidas\.[a-z0-9]+(\?|$)/i.test(url);

export const renomear = (handle: string, url: string) =>
  (RENOMEADAS[handle] ?? []).reduce((u, [de, para]) => u.replace(de, para), url);

/** A tabela de medidas vai para o fim da galeria, sem mexer na ordem do resto. */
export const medidasPorUltimo = (urls: string[]) => [...urls.filter((u) => !isMedidas(u)), ...urls.filter(isMedidas)];

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
