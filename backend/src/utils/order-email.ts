import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { productionDaysOfProducts } from "../modules/melhor-envio/quote"
import { methodLabel } from "./payment-method"

const siteUrl = () => (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")
export const ordersUrl = () => `${siteUrl()}/account/orders`

/** Pelo módulo de pedidos, que já devolve totais e quantidades calculados (o grafo de consulta devolve zeros em totais). */
export async function loadOrder(scope: MedusaContainer, orderId: string) {
  try {
    return (await scope.resolve(Modules.ORDER).retrieveOrder(orderId, {
      select: ["id", "display_id", "email", "currency_code", "total", "shipping_total", "customer_id", "metadata", "created_at"],
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

const absolute = (url?: string | null) => {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${(process.env.SITE_URL || "").replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`
}

const STATUS_LABEL: Record<string, string> = { approved: "aprovado", authorized: "autorizado", pending: "aguardando", in_process: "em análise" }

/** Pagamento do pedido (forma, situação e número no Mercado Pago), a partir da sessão de pagamento. */
export async function paymentInfo(scope: MedusaContainer, orderId: string) {
  const { data } = await scope
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({ entity: "order", fields: ["payment_collections.payments.data", "payment_collections.payments.captured_at"], filters: { id: orderId } })
  const payment = (data[0] as any)?.payment_collections?.[0]?.payments?.[0]
  const d = (payment?.data ?? {}) as { method?: string; mp_status?: string; mp_payment_id?: number | string }
  if (!payment) return null
  return { method: methodLabel(d.method, "Mercado Pago"), status: STATUS_LABEL[d.mp_status ?? ""] ?? null, id: d.mp_payment_id ? String(d.mp_payment_id) : null }
}

export async function confirmationData(scope: MedusaContainer, order: any) {
  const a = order.shipping_address
  const items = (order.items ?? []).map((i: any) => ({
    title: i.product_title || i.title,
    variant: i.variant_title && i.variant_title !== i.product_title ? i.variant_title : null,
    quantity: i.quantity,
    unit_price: i.unit_price,
    image: absolute(i.thumbnail),
  }))
  return {
    ...baseOrderData(order),
    currency_code: order.currency_code,
    placed_at: order.created_at ? new Date(order.created_at).toISOString() : null,
    subtotal: items.reduce((s: number, i: any) => s + i.unit_price * i.quantity, 0),
    total: order.total,
    shipping_total: order.shipping_total,
    shipping_name: order.shipping_methods?.[0]?.name ?? null,
    items,
    address_info: a
      ? {
          name: [a.first_name, a.last_name].filter(Boolean).join(" "),
          line1: [a.address_1, a.address_2].filter(Boolean).join(", "),
          district: a.metadata?.neighborhood ?? null,
          city: a.city,
          uf: a.province,
          zip: String(a.postal_code ?? "").replace(/^(\d{5})(\d{3})$/, "$1-$2"),
          phone: a.phone ?? null,
        }
      : null,
    payment: await paymentInfo(scope, order.id),
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
