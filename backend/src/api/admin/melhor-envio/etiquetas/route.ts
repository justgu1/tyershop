import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { autoLabelEnabled, setAutoLabel } from "../../../../modules/melhor-envio/auto-label"
import { BusyError, purchaseLabel } from "../../../../modules/melhor-envio/purchase"

const MAX_BULK = 30
const BOUGHT = ["gerada", "postada", "entregue"]

/** Pedidos pagos, com entrega, ainda sem etiqueta, e o modo (automático ou manual) da compra. */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "created_at", "status", "metadata", "shipping_methods.name", "payment_collections.payments.captured_at"],
    pagination: { take: 300, order: { created_at: "DESC" } },
  })
  const orders = (data as any[])
    .filter((o) => o.status !== "canceled" && (o.shipping_methods ?? []).length > 0)
    .filter((o) => (o.payment_collections ?? []).some((pc: any) => (pc.payments ?? []).some((p: any) => p.captured_at)))
    .filter((o) => !BOUGHT.includes(o.metadata?.melhor_envio?.status))
    .map((o) => ({
      id: o.id,
      display_id: o.display_id,
      email: o.email,
      created_at: o.created_at,
      shipping: o.shipping_methods?.[0]?.name ?? null,
      label_status: o.metadata?.melhor_envio?.status ?? null,
      error: o.metadata?.melhor_envio?.error ?? null,
    }))
  res.json({ auto: await autoLabelEnabled(req.scope), orders })
}

/** `auto` liga ou desliga a compra automática; `order_ids` compra as etiquetas desses pedidos, uma de cada vez. */
export async function POST(req: AuthenticatedMedusaRequest<{ auto?: boolean; order_ids?: string[] }>, res: MedusaResponse) {
  if (typeof req.body?.auto === "boolean") {
    await setAutoLabel(req.scope, req.body.auto)
    return res.json({ auto: req.body.auto })
  }
  const ids = [...new Set((req.body?.order_ids ?? []).filter((id) => typeof id === "string"))]
  if (!ids.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Escolha ao menos um pedido.")
  if (ids.length > MAX_BULK) throw new MedusaError(MedusaError.Types.INVALID_DATA, `No máximo ${MAX_BULK} pedidos por vez.`)

  const results: { id: string; status: string; error?: string }[] = []
  for (const id of ids) {
    try {
      const state = await purchaseLabel(req.scope, id)
      results.push({ id, status: state.status, error: state.error })
    } catch (err) {
      results.push({ id, status: "erro", error: err instanceof BusyError ? "Outra compra deste pedido está em andamento." : (err as Error).message })
    }
  }
  res.json({ results })
}
