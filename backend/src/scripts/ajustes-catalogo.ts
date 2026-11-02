import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createProductCategoriesWorkflow,
  deleteProductsWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";

// Idempotente. Remove o shorts Starter (igual ao Pro) e tira a pulseira do Starter, para a categoria própria "Pulseiras",
// sem a foto da modelo na galeria.
export default async function ajustesCatalogo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const get = async (handle: string) =>
    (
      await query.graph({
        entity: "product",
        fields: ["id", "handle", "images.id", "images.url", "images.rank"],
        filters: { handle },
      })
    ).data[0] as any;

  const shorts = await get("shorts-tyer-starter-dry-fit");
  if (shorts) {
    await deleteProductsWorkflow(container).run({ input: { ids: [shorts.id] } });
    logger.info("shorts-tyer-starter-dry-fit excluído");
  }

  const pulseira = await get("pulseira-tyer");
  if (!pulseira) throw new Error("pulseira-tyer não encontrada");

  const productModule = container.resolve(Modules.PRODUCT);
  let [categoria] = await productModule.listProductCategories({ handle: "pulseiras" });
  if (!categoria) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: [{ name: "Pulseiras", handle: "pulseiras", is_active: true, is_internal: false }] },
    });
    categoria = result[0];
  }

  const images = pulseira.images
    .filter((i: any) => !i.url.endsWith("/pulseira-preta/2.webp"))
    .sort((a: any, b: any) => a.rank - b.rank)
    .map((i: any) => ({ url: i.url }));

  await updateProductsWorkflow(container).run({
    input: { products: [{ id: pulseira.id, collection_id: null, category_ids: [categoria.id], images }] },
  });
  logger.info(`pulseira-tyer: categoria Pulseiras, ${images.length} imagens, fora do Starter`);
}
