import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"

/** O Mercado Pago já cobrou na criação do pagamento: aqui só se marca como capturado no Medusa, para o pedido constar como pago. */
export default async function orderPlacedCaptureHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["display_id", "payment_collections.payments.id", "payment_collections.payments.amount", "payment_collections.payments.captured_at"],
    filters: { id: data.id },
  })
  for (const pc of (orders[0] as any)?.payment_collections ?? []) {
    for (const payment of pc.payments ?? []) {
      if (payment.captured_at) continue
      const { errors } = await capturePaymentWorkflow(container).run({ input: { payment_id: payment.id, amount: payment.amount }, throwOnError: false })
      if (errors?.length) container.resolve("logger").warn(`captura do pedido #${(orders[0] as any).display_id}: ${errors[0].error?.message} (a conciliação tenta de novo)`)
    }
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
