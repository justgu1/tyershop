import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { claimMetadataKey, setMetadataKey } from "../utils/order-metadata"
import { confirmationData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await loadOrder(container, data.id)
  if (!order?.email) return
  // O evento pode chegar mais de uma vez: só quem marca primeiro envia a confirmação.
  if (!(await claimMetadataKey(container, data.id, "confirmation_sent_at", new Date().toISOString()))) return
  const sent = await sendOrderEmail(container, order.email, "order_confirmation", await confirmationData(container, order))
  if (!sent) await setMetadataKey(container, data.id, "confirmation_sent_at", null)
}

export const config: SubscriberConfig = { event: "order.placed" }
