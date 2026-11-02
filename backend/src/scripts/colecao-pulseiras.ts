import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCollectionsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";

// Idempotente. Coleção própria das pulseiras (página /collections/pulseiras); a loja a esconde do carrossel de drops.
export default async function colecaoPulseiras({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  let [colecao] = await productModule.listProductCollections({ handle: "pulseiras" });
  if (!colecao) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: [{ title: "Pulseiras", handle: "pulseiras", metadata: { description: "Pulseiras Tyer." } }] },
    });
    colecao = result[0];
  }

  const { data } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: "pulseira-tyer" } });
  if (!data[0]) throw new Error("pulseira-tyer não encontrada");
  await updateProductsWorkflow(container).run({
    input: { products: [{ id: data[0].id, collection_id: colecao.id }] },
  });
  logger.info(`pulseira-tyer na coleção ${colecao.id}`);
}
