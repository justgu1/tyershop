import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { deleteProductVariantsWorkflow } from "@medusajs/medusa/core-flows";

const PRODUTOS_DROP6 = ["camiseta-tyer-gang", "short-compressao-cacada", "calca-cacada", "regata-cacada", "pulseira-cacada"];

// Idempotente: apaga as variações de tamanho PP das peças do Drop 6.
export default async function removerTamanhoPP({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({ entity: "product", fields: ["handle", "variants.id", "variants.title", "variants.options.value"], filters: { handle: PRODUTOS_DROP6 } });
  const ids = (data as any[]).flatMap((p) =>
    (p.variants ?? [])
      .filter((v: any) => (v.options ?? []).some((o: any) => String(o.value).trim().toUpperCase() === "PP"))
      .map((v: any) => v.id as string)
  );
  if (ids.length) await deleteProductVariantsWorkflow(container).run({ input: { ids } });
  logger.info(`PP removido: ${ids.length} variações`);
}
