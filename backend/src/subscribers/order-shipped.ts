import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { baseOrderData, loadOrder, sendOrderEmail } from "../utils/order-email"

/** Rastreio público do Melhor Envio, usado quando o admin informa só o código. */
const trackingUrl = (code: string) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`

async function orderOfFulfillment(container: SubscriberArgs<any>["container"], fulfillmentId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: links } = await query.graph({ entity: "order_fulfillment", fields: ["order_id"], filters: { fulfillment_id: fulfillmentId } })
  if (!links[0]?.order_id) return null
  return loadOrder(container, links[0].order_id)
}

type Event = { id: string; fulfillment_id?: string; no_notification?: boolean }

export default async function orderShippedHandler({ event: { data }, container }: SubscriberArgs<Event>) {
  if (data.no_notification) return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const order = await orderOfFulfillment(container, data.fulfillment_id ?? data.id)
  if (!order?.email) return
  const { data: fulfillments } = await query.graph({ entity: "fulfillment", fields: ["id", "labels.tracking_number", "labels.tracking_url"], filters: { id: data.fulfillment_id ?? data.id } })
  const label = fulfillments[0]?.labels?.find((l: any) => l.tracking_number) ?? fulfillments[0]?.labels?.[0]
  const code: string | undefined = label?.tracking_number || undefined
  await sendOrderEmail(container, order.email, "order_shipped", {
    ...baseOrderData(order),
    tracking_code: code ?? null,
    tracking_url: label?.tracking_url || (code ? trackingUrl(code) : null),
  })
}

export const config: SubscriberConfig = { event: "shipment.created" }
