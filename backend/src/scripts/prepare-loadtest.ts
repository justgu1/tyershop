import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../modules/drop"
import { MELHOR_ENVIO_MODULE } from "../modules/melhor-envio"
import { setDropProducts } from "../modules/drop/products"

const HANDLE = "carga-teste"

/**
 * Deixa um ambiente DESCARTÁVEL pronto para o teste de carga: cria o drop "carga-teste" em venda geral sem lote
 * com os primeiros produtos publicados, libera esses produtos do controle de estoque (o teste não pode esgotar nada)
 * e põe um token de frete falso para o simulador. Imprime o estado original (`LOADTEST_STATE=`) para a desmontagem.
 *   LOAD_TEST_MODE=true npx medusa exec ./src/scripts/prepare-loadtest.ts
 *   LOAD_TEST_MODE=true LOADTEST_STATE='...' npx medusa exec ./src/scripts/prepare-loadtest.ts   (desmonta)
 */
export default async function prepare({ container }: ExecArgs) {
  if (process.env.LOAD_TEST_MODE !== "true") {
    throw new Error("Recusado: defina LOAD_TEST_MODE=true (somente em ambiente de teste de carga).")
  }
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const drops = container.resolve(DROP_MODULE) as any
  const products = container.resolve(Modules.PRODUCT) as any
  const me = container.resolve(MELHOR_ENVIO_MODULE) as any
  const day = 24 * 3600 * 1000

  // ─── Desmontagem ───
  if (process.env.LOADTEST_STATE) {
    const state = JSON.parse(process.env.LOADTEST_STATE) as { variants: { id: string; manage_inventory: boolean; allow_backorder: boolean }[]; fakeToken: boolean }
    await products.updateProductVariants(state.variants)
    const [mine] = await drops.listDrops({ handle: HANDLE }, { take: 1 })
    if (mine) await drops.deleteDrops(mine.id)
    if (state.fakeToken) {
      const tokens = await me.listMelhorEnvioTokens({ access_token: "token-de-carga" })
      if (tokens.length) await me.deleteMelhorEnvioTokens(tokens.map((t: any) => t.id))
    }
    logger.info("Teste de carga: desmontado")
    return
  }

  // ─── Montagem ───
  const { data: published } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "variants.id", "variants.manage_inventory", "variants.allow_backorder"],
    filters: { status: "published" },
    pagination: { take: 20 },
  })
  const picked = (published as any[]).filter((p) => (p.variants ?? []).length)
  if (!picked.length) throw new Error("Nenhum produto publicado com variantes.")
  const variants = picked.flatMap((p) => p.variants)

  let [drop] = await drops.listDrops({ handle: HANDLE }, { take: 1 })
  const schedule = {
    preorder_starts_at: new Date(Date.now() - 3 * day),
    preorder_ends_at: new Date(Date.now() - 2 * day),
    general_starts_at: new Date(Date.now() - 2 * day),
    general_ends_at: new Date(Date.now() + 30 * day),
    general_lot: null,
    closed_at: null,
  }
  if (!drop) drop = await drops.createDrops({ handle: HANDLE, title: "Carga Teste", is_current: false, production_days: 21, ...schedule })
  else await drops.updateDrops({ id: drop.id, ...schedule })
  await drops.makeCurrent(drop.id)
  await setDropProducts(container, drop.id, picked.map((p) => p.id))

  const original = variants.map((v: any) => ({ id: v.id, manage_inventory: !!v.manage_inventory, allow_backorder: !!v.allow_backorder }))
  await products.updateProductVariants(variants.map((v: any) => ({ id: v.id, manage_inventory: false, allow_backorder: true })))

  const status = await me.status()
  let fakeToken = false
  if (!status.connected) {
    await me.createMelhorEnvioTokens({ access_token: "token-de-carga", refresh_token: "refresh-de-carga", expires_at: new Date(Date.now() + 20 * day) })
    fakeToken = true
  }

  console.log(`LOADTEST_STATE=${JSON.stringify({ variants: original, fakeToken })}`)
  logger.info(`Teste de carga: drop ${HANDLE} em venda geral, ${picked.length} produtos e ${variants.length} variantes liberadas`)
}
