import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { confirmationData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderPlacedHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const order = await loadOrder(container, data.id)
  if (!order?.email) return
  await sendOrderEmail(container, order.email, "order_confirmation", await confirmationData(container, order))
}

export const config: SubscriberConfig = { event: "order.placed" }
