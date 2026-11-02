import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { baseOrderData, orderOfFulfillment, sendOrderEmail } from "../utils/order-email"

export default async function orderDeliveredHandler({ event: { data }, container }: SubscriberArgs<{ id: string; fulfillment_id?: string; no_notification?: boolean }>) {
  if (data.no_notification) return
  const order = await orderOfFulfillment(container, data.fulfillment_id ?? data.id)
  if (!order?.email) return
  await sendOrderEmail(container, order.email, "order_delivered", baseOrderData(order))
}

export const config: SubscriberConfig = { event: "delivery.created" }
