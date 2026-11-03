import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createCollectionsWorkflow, updateCollectionsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows";

// Idempotente. Cada coleção vira uma faixa na /drop; o banner (metadata.banner_url) é preenchido depois no admin.
// A pulseira também entra na categoria Pulseiras (a categoria vem de ajustes-catalogo.ts).
// Rode depois de importar data/import-pre-venda.csv: liga cada produto à sua coleção pelo handle.
const CATEGORIA_PULSEIRAS = "pulseiras";
const COLECOES = [
  { title: "Tyer Gang", handle: "tyer-gang", order: 1, label: "Cápsula", banner_url: "/drop-banners/tyer-gang.webp", handles: ["camiseta-tyer-gang"] },
  {
    title: "Caçada",
    handle: "cacada",
    order: 2,
    label: "Drop",
    banner_url: "/drop-banners/cacada.webp",
    handles: ["short-compressao-cacada", "calca-cacada", "regata-cacada", "pulseira-cacada"],
  },
];

export default async function colecoesPreVenda({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  const [categoria] = await productModule.listProductCategories({ handle: CATEGORIA_PULSEIRAS });

  async function categorizarPulseira(handle?: string) {
    if (!handle) return;
    if (!categoria) throw new Error("categoria pulseiras não existe: rode ajustes-catalogo.ts antes");
    const { data } = await query.graph({ entity: "product", fields: ["id", "categories.id"], filters: { handle } });
    const produto = data[0] as { id: string; categories?: { id: string }[] } | undefined;
    if (!produto) return;
    const ids = new Set([...(produto.categories ?? []).map((x) => x.id), categoria.id]);
    await updateProductsWorkflow(container).run({ input: { products: [{ id: produto.id, category_ids: [...ids] }] } });
  }

  for (const c of COLECOES) {
    const [existente] = await productModule.listProductCollections({ handle: c.handle });
    const metadata = { ...(c.banner_url ? { banner_url: c.banner_url } : {}), ...(existente?.metadata ?? {}), order: c.order, label: c.label, pre_venda: true };
    let colecao = existente;
    if (!colecao) {
      const { result } = await createCollectionsWorkflow(container).run({
        input: { collections: [{ title: c.title, handle: c.handle, metadata }] },
      });
      colecao = result[0];
    } else {
      await updateCollectionsWorkflow(container).run({ input: { selector: { id: colecao.id }, update: { metadata } } });
    }
    logger.info(`coleção ${c.title}: ${colecao.id}`);

    const { data } = await query.graph({ entity: "product", fields: ["id", "handle"], filters: { handle: c.handles } });
    for (const p of data as { id: string; handle: string }[]) {
      await updateProductsWorkflow(container).run({ input: { products: [{ id: p.id, collection_id: colecao.id }] } });
    }
    await categorizarPulseira(c.handles.find((h) => h.startsWith("pulseira")));
    const faltam = c.handles.filter((h) => !(data as { handle: string }[]).some((p) => p.handle === h));
    logger.info(`${c.title}: ${data.length} produto(s) ligado(s)${faltam.length ? `, ainda não importados: ${faltam.join(", ")}` : ""}`);
  }
}
