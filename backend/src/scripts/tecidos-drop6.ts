import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows";

// A página do produto mostra `metadata.composition` em "Composição e diferenciais".
export const TECIDOS: Record<string, string> = {
  "camiseta-tyer-gang": "Tecido: algodão 180g",
  "short-compressao-cacada": "Tecido: Dri Fit reforçado",
  "calca-cacada": "Tecido: Helanca esportiva",
  "regata-cacada": "Tecido: algodão leve",
  "camiseta-tyer-starter-dry-fit": "Tecido: Dri Fit",
};

// Idempotente: grava o tecido de cada peça preservando o resto do metadata.
export default async function tecidosDrop6({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product", fields: ["id", "handle", "metadata"], filters: { handle: Object.keys(TECIDOS) } });
  for (const p of data as any[]) {
    await updateProductsWorkflow(container).run({
      input: { selector: { id: p.id }, update: { metadata: { ...(p.metadata ?? {}), composition: TECIDOS[p.handle] } } },
    });
  }
  const achados = (data as any[]).map((p) => p.handle);
  const faltando = Object.keys(TECIDOS).filter((h) => !achados.includes(h));
  logger.info(`tecidos gravados: ${achados.length} de ${Object.keys(TECIDOS).length}${faltando.length ? ` (não achei: ${faltando.join(", ")})` : ""}`);
}
