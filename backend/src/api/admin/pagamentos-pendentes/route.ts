import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getMercadoPagoClient } from "../../store/checkout/mercadopago/utils"

const DAY_MS = 24 * 3600 * 1000

/**
 * Tentativas de pagamento que ainda não viraram pedido: carrinho com Pix gerado (aguardando, vencido, recusado) dos últimos 7 dias.
 * Carrinho sem pagamento não é pedido no Medusa; aqui o que ficou no meio do caminho aparece, com a situação no Mercado Pago.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const client = getMercadoPagoClient()
  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "email", "created_at", "payment_collection.payment_sessions.data"],
    filters: { completed_at: null, created_at: { $gte: new Date(Date.now() - 7 * DAY_MS) } },
    pagination: { take: 200, order: { created_at: "DESC" } },
  })

  const withPayment = (carts as any[])
    .map((c) => ({ cart: c, mpId: (c.payment_collection?.payment_sessions ?? []).find((s: any) => s.data?.mp_payment_id)?.data?.mp_payment_id }))
    .filter((x) => x.mpId)
    .slice(0, 60)

  const items = await Promise.all(
    withPayment.map(async ({ cart, mpId }) => {
      const p = await client.getPayment(mpId).catch(() => null)
      return {
        cart_id: cart.id,
        email: cart.email ?? null,
        created_at: cart.created_at,
        mp_payment_id: mpId,
        method: (cart.payment_collection?.payment_sessions ?? []).find((s: any) => s.data?.mp_payment_id)?.data?.method ?? null,
        amount: p ? Number(p.transaction_amount) : null,
        status: p?.status ?? "desconhecido",
        status_detail: p?.status_detail ?? null,
        expires_at: p?.date_of_expiration ?? null,
      }
    })
  )
  res.json({ items })
}
