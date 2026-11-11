import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { loadOrder, refundEmailData, sendOrderEmail } from "../utils/order-email"

export default async function orderCanceledHandler({ event: { data }, container }: SubscriberArgs<{ id: string; no_notification?: boolean }>) {
  if (data.no_notification) return
  const order = await loadOrder(container, data.id)
  if (!order?.email) return
  await sendOrderEmail(container, order.email, "order_canceled", await refundEmailData(container, order))
}

export const config: SubscriberConfig = { event: "order.canceled" }
