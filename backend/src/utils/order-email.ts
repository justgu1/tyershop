import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { productionDaysOfProducts } from "../modules/melhor-envio/quote"

const siteUrl = () => (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")
export const ordersUrl = () => `${siteUrl()}/account/orders`

/** Pelo módulo de pedidos, que já devolve totais e quantidades calculados (o grafo de consulta devolve zeros em totais). */
export async function loadOrder(scope: MedusaContainer, orderId: string) {
  try {
    return (await scope.resolve(Modules.ORDER).retrieveOrder(orderId, {
      select: ["id", "display_id", "email", "currency_code", "total", "shipping_total", "customer_id", "metadata"],
      relations: ["items", "shipping_address", "shipping_methods"],
    })) as any
  } catch {
    return null
  }
}

/** Rastreio público do Melhor Envio, usado quando a transportadora não devolve um link próprio. */
export const trackingUrl = (code: string) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`

/** Pedido a que um envio (fulfillment) pertence. */
export async function orderOfFulfillment(scope: MedusaContainer, fulfillmentId: string) {
  const { data } = await scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "order_fulfillment", fields: ["order_id"], filters: { fulfillment_id: fulfillmentId } })
  const orderId = (data[0] as { order_id?: string } | undefined)?.order_id
  return orderId ? loadOrder(scope, orderId) : null
}

/** Dados comuns de todos os e-mails de pedido. */
export function baseOrderData(order: any) {
  return {
    email: order.email,
    name: order.shipping_address?.first_name ?? null,
    display_id: order.display_id,
    orders_url: ordersUrl(),
  }
}

export async function confirmationData(scope: MedusaContainer, order: any) {
  const a = order.shipping_address
  return {
    ...baseOrderData(order),
    currency_code: order.currency_code,
    total: order.total,
    shipping_total: order.shipping_total,
    items: (order.items ?? []).map((i: any) => ({
      title: i.product_title || i.title,
      variant: i.variant_title && i.variant_title !== i.product_title ? i.variant_title : null,
      quantity: i.quantity,
      unit_price: i.unit_price,
    })),
    address: a ? [a.address_1, a.address_2, `${a.city}${a.province ? `/${a.province}` : ""}`, a.postal_code].filter(Boolean).join(", ") : null,
    production_days: (await productionDaysOfProducts(scope, (order.items ?? []).map((i: any) => i.product_id).filter(Boolean))) || null,
  }
}

export async function sendOrderEmail(scope: MedusaContainer, to: string, template: string, data: Record<string, unknown>, attachments?: { content: string; filename: string; content_type: string }[]): Promise<boolean> {
  try {
    await scope.resolve(Modules.NOTIFICATION).createNotifications({
      to,
      channel: "email",
      template,
      data,
      ...(attachments ? { attachments: attachments.map((a) => ({ ...a, disposition: "attachment" as const })) } : {}),
    })
    return true
  } catch (err) {
    // Falha de e-mail não pode derrubar o pedido nem a ação do admin.
    scope.resolve("logger").error(`E-mail ${template} não enviado: ${(err as Error).message}`)
    return false
  }
}
