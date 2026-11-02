import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { baseOrderData, orderOfFulfillment, sendOrderEmail, trackingUrl } from "../utils/order-email"

type Event = { id: string; fulfillment_id?: string; no_notification?: boolean }

export default async function orderShippedHandler({ event: { data }, container }: SubscriberArgs<Event>) {
  if (data.no_notification) return
  const fulfillmentId = data.fulfillment_id ?? data.id
  const order = await orderOfFulfillment(container, fulfillmentId)
  if (!order?.email) return
  const { data: fulfillments } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "fulfillment", fields: ["id", "labels.tracking_number", "labels.tracking_url"], filters: { id: fulfillmentId } })
  const label = fulfillments[0]?.labels?.find((l: any) => l.tracking_number) ?? fulfillments[0]?.labels?.[0]
  const code: string | undefined = label?.tracking_number || undefined
  await sendOrderEmail(container, order.email, "order_shipped", {
    ...baseOrderData(order),
    tracking_code: code ?? null,
    tracking_url: label?.tracking_url || (code ? trackingUrl(code) : null),
  })
}

export const config: SubscriberConfig = { event: "shipment.created" }
