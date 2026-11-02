import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../modules/drop"
import { MELHOR_ENVIO_MODULE } from "../modules/melhor-envio"

/**
 * Deixa um ambiente DESCARTÁVEL pronto para o teste de carga: drop atual em venda geral sem lote, produtos
 * sem controle de estoque (o teste não pode esgotar nada) e um token de frete falso para o simulador.
 * NUNCA rode contra o banco de homologação/produção (que são o mesmo). Exige LOAD_TEST_MODE=true.
 *   npx medusa exec ./src/scripts/prepare-loadtest.ts
 */
export default async function prepare({ container }: ExecArgs) {
  if (process.env.LOAD_TEST_MODE !== "true") {
    throw new Error("Recusado: defina LOAD_TEST_MODE=true (somente em ambiente de teste de carga).")
  }
  const logger = container.resolve("logger")
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const drops = container.resolve(DROP_MODULE) as any
  const products = container.resolve(Modules.PRODUCT) as any

  const current = await drops.retrieveCurrent()
  if (!current) throw new Error("Nenhum drop atual: crie um drop antes.")
  const now = Date.now()
  const day = 24 * 3600 * 1000
  await drops.updateDrops({
    id: current.id,
    preorder_starts_at: new Date(now - 3 * day),
    preorder_ends_at: new Date(now - 2 * day),
    general_starts_at: new Date(now - 2 * day),
    general_ends_at: new Date(now + 30 * day),
    general_lot: null,
    closed_at: null,
  })

  const { data } = await query.graph({ entity: "drop", fields: ["id", "products.id", "products.variants.id"], filters: { id: current.id } })
  const variants = ((data as any[])[0]?.products ?? []).flatMap((p: any) => (p.variants ?? []).map((v: any) => v.id))
  if (!variants.length) throw new Error("O drop atual não tem produtos vinculados.")
  await products.updateProductVariants(variants.map((id: string) => ({ id, manage_inventory: false, allow_backorder: true })))

  const me = container.resolve(MELHOR_ENVIO_MODULE) as any
  const status = await me.status()
  if (!status.connected) {
    await me.createMelhorEnvioTokens({ access_token: "token-de-carga", refresh_token: "refresh-de-carga", expires_at: new Date(now + 20 * day) })
  }

  logger.info(`Teste de carga: drop ${current.handle} em venda geral, ${variants.length} variantes liberadas`)
}
