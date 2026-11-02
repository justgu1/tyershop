import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { deleteProductVariantsWorkflow } from "@medusajs/medusa/core-flows";

// Idempotente. Deixa a pulseira com uma única opção "Cor" (Preto, Branco), uma variante por cor e a galeria de cada uma
// só com as fotos da própria cor.
const COR_POR_SKU: Record<string, { cor: string; pasta: string; fotos: number[] }> = {
  "pulseira-tyer-preto": { cor: "Preto", pasta: "pulseira-preta", fotos: [1, 3, 4] },
  "pulseira-tyer-branco": { cor: "Branco", pasta: "pulseira-branca", fotos: [1, 2, 3, 4] },
};

export default async function corrigirPulseira({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModule = container.resolve(Modules.PRODUCT);

  const load = async () =>
    (
      await query.graph({
        entity: "product",
        fields: ["id", "options.id", "options.title", "variants.id", "variants.sku", "variants.thumbnail", "variants.metadata"],
        filters: { handle: "pulseira-tyer" },
      })
    ).data[0] as any;

  let produto = await load();
  if (!produto) throw new Error("pulseira-tyer não encontrada");

  const extras = produto.variants.filter((v: any) => !COR_POR_SKU[v.sku]).map((v: any) => v.id);
  if (extras.length) await deleteProductVariantsWorkflow(container).run({ input: { ids: extras } });

  const origem = String(produto.variants.find((v: any) => v.metadata?.variant_gallery?.[0])?.metadata.variant_gallery[0] ?? "").split("/produtos/")[0];

  produto = await load();
  const cor = produto.options.find((o: any) => o.title === "Cor");
  const tamanho = produto.options.find((o: any) => o.title === "Tamanho");
  const opcao = cor ?? tamanho;
  await productModule.updateProductOptions(opcao.id, { title: "Cor", values: ["Preto", "Branco"] });
  // Enquanto "Tamanho" existe, a variante precisa informar um valor para cada opção do produto.
  const titulos: string[] = produto.options.map((o: any) => (o.title === "Tamanho" && cor ? "Tamanho" : "Cor"));

  for (const v of produto.variants) {
    const alvo = COR_POR_SKU[v.sku];
    const base = `${origem}/produtos/accessorios/${alvo.pasta}`;
    await productModule.updateProductVariants(v.id, {
      title: alvo.cor,
      options: Object.fromEntries(titulos.map((t) => [t, alvo.cor])),
      thumbnail: `${base}/1.webp`,
      metadata: { ...(v.metadata ?? {}), variant_gallery: alvo.fotos.map((n) => `${base}/${n}.webp`) },
    });
  }

  if (cor && tamanho) await productModule.deleteProductOptions([tamanho.id]);
  logger.info(`pulseira-tyer: opção Cor, ${produto.variants.length} variantes`);
}
