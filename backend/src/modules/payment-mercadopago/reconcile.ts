import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { getMercadoPagoClient } from "../../api/store/checkout/mercadopago/utils"
import { shouldComplete } from "./reconcile-rules"
import { completeCartLockKey } from "./complete-lock"

const DAY_MS = 24 * 3600 * 1000

export type ReconcileResult = { completed: string[]; captured: string[]; errors: string[] }

/**
 * Rede de segurança entre o banco e o Mercado Pago, para quando o cliente fecha a página antes de o Pix cair (ou o webhook falha):
 *  1. carrinho aberto cujo pagamento está aprovado no Mercado Pago vira pedido;
 *  2. pagamento autorizado e ainda não capturado é capturado (o Mercado Pago já cobrou na criação).
 * Idempotente: repetir não cria pedido nem captura de novo.
 */
export async function reconcilePayments(scope: MedusaContainer, days = 3): Promise<ReconcileResult> {
  const out: ReconcileResult = { completed: [], captured: [], errors: [] }
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const locking = scope.resolve(Modules.LOCKING) as any
  const client = getMercadoPagoClient()
  const since = new Date(Date.now() - days * DAY_MS)

  const { data: carts } = await query.graph({
    entity: "cart",
    fields: ["id", "payment_collection.payment_sessions.id", "payment_collection.payment_sessions.data"],
    filters: { completed_at: null, updated_at: { $gte: since } },
    pagination: { take: 500 },
  })
  for (const cart of carts as any[]) {
    const session = (cart.payment_collection?.payment_sessions ?? []).find((s: any) => s.data?.mp_payment_id)
    if (!session) continue
    try {
      const payment = await client.getPayment(session.data.mp_payment_id)
      if (!shouldComplete(payment.status)) continue
      await locking.execute(completeCartLockKey(cart.id), async () => {
        const { errors } = await completeCartWorkflow(scope).run({ input: { id: cart.id }, throwOnError: false })
        if (errors?.length) out.errors.push(`${cart.id}: ${errors[0].error?.message}`)
        else out.completed.push(cart.id)
      }, { timeout: 1 })
    } catch (err) {
      if (!/timed out|acquire/i.test((err as Error).message)) out.errors.push(`${cart.id}: ${(err as Error).message}`)
    }
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "payment_collections.payments.id", "payment_collections.payments.amount", "payment_collections.payments.captured_at"],
    filters: { created_at: { $gte: since } },
    pagination: { take: 500 },
  })
  for (const order of orders as any[]) {
    for (const pc of order.payment_collections ?? []) {
      for (const payment of pc.payments ?? []) {
        if (payment.captured_at) continue
        const { errors } = await capturePaymentWorkflow(scope).run({ input: { payment_id: payment.id, amount: payment.amount }, throwOnError: false })
        if (errors?.length) out.errors.push(`pedido ${order.display_id}: ${errors[0].error?.message}`)
        else out.captured.push(String(order.display_id))
      }
    }
  }
  return out
}
