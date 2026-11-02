import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { claimConfirmation, setMetadataKey } from "../utils/order-metadata"
import { confirmationData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await loadOrder(container, data.id)
  if (!order?.email) return
  // O evento pode chegar mais de uma vez: só quem reserva primeiro envia a confirmação.
  if (!(await claimConfirmation(container, data.id))) return
  const sent = await sendOrderEmail(container, order.email, "order_confirmation", await confirmationData(container, order))
  if (!sent) throw new Error(`Confirmação do pedido ${data.id} não enviada`)
  await setMetadataKey(container, data.id, "confirmation_sent_at", new Date().toISOString())
}

export const config: SubscriberConfig = { event: "order.placed" }
