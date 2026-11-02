import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { baseOrderData, loadOrder, sendOrderEmail } from "../utils/order-email"

export default async function orderDeliveredHandler({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({ entity: "order_fulfillment", fields: ["order_id"], filters: { fulfillment_id: data.id } })
  if (!links[0]?.order_id) return
  const order = await loadOrder(container, links[0].order_id)
  if (!order?.email) return
  await sendOrderEmail(container, order.email, "order_delivered", baseOrderData(order))
}

export const config: SubscriberConfig = { event: "delivery.created" }
