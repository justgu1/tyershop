import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { claimMetadataKey, setMetadataKey } from "../utils/order-metadata"
import { confirmationData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await loadOrder(container, data.id)
  if (!order?.email) return
  // O evento pode chegar mais de uma vez: só quem marca primeiro envia a confirmação.
  if (!(await claimMetadataKey(container, data.id, "confirmation_sent_at", new Date().toISOString()))) return
  let sent = false
  try {
    sent = await sendOrderEmail(container, order.email, "order_confirmation", await confirmationData(container, order))
  } finally {
    // Qualquer falha (montar os dados, enviar) devolve a marca, para uma nova entrega do evento tentar de novo.
    if (!sent) await setMetadataKey(container, data.id, "confirmation_sent_at", null)
  }
}

export const config: SubscriberConfig = { event: "order.placed" }
