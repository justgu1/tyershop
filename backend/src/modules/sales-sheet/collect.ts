import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DropInfo, SaleLine } from "./aggregate"

const pg = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any

/** Reembolso do pedido rateado entre as linhas, na proporção do valor de cada uma. */
export function allocateRefund(lineAmounts: number[], refund: number): number[] {
  const total = lineAmounts.reduce((a, b) => a + b, 0)
  if (!total || !refund) return lineAmounts.map(() => 0)
  let left = Math.min(refund, total)
  return lineAmounts.map((amount, i) => {
    const part = i === lineAmounts.length - 1 ? left : Math.min(left, Math.round((refund * amount) / total))
    left -= part
    return part
  })
}

export type DropCatalog = { drops: DropInfo[]; dropOfProduct: Map<string, string> }

export async function collectDrops(scope: MedusaContainer): Promise<DropCatalog> {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "drop",
    fields: ["id", "handle", "title", "preorder_starts_at", "preorder_ends_at", "general_starts_at", "products.id"],
  })
  const dropOfProduct = new Map<string, string>()
  const drops = (data as any[]).map((d) => {
    for (const p of d.products ?? []) dropOfProduct.set(p.id, d.id)
    return {
      id: d.id,
      handle: d.handle,
      title: d.title,
      startsAt: new Date(d.preorder_starts_at),
      salesStart: new Date(d.general_starts_at ?? d.preorder_ends_at),
    }
  })
  return { drops, dropOfProduct }
}

/** Uma linha por item de pedido, já com o drop do produto; valores em reais, como o Medusa v2 guarda. */
export async function collectSaleLines(scope: MedusaContainer, dropOfProduct: Map<string, string>): Promise<SaleLine[]> {
  const db = pg(scope)
  const items = await db.raw(
    `select o.id as order_id, o.display_id, o.created_at, li.title, li.variant_title, (o.status = 'canceled') as canceled, oi.quantity::float as quantity,
            (li.unit_price * oi.quantity)::float as amount, li.product_id
       from order_item oi
       join order_line_item li on li.id = oi.item_id
       join "order" o on o.id = oi.order_id
      where oi.deleted_at is null and o.deleted_at is null`
  )
  const refunds = await db.raw(
    `select order_id, sum(amount)::float as refunded from order_transaction
      where reference = 'refund' and deleted_at is null group by order_id`
  )
  const refundOf = new Map<string, number>((refunds.rows ?? []).map((r: any) => [r.order_id, Math.abs(Number(r.refunded))]))

  const byOrder = new Map<string, any[]>()
  for (const r of items.rows ?? []) byOrder.set(r.order_id, [...(byOrder.get(r.order_id) ?? []), r])

  const lines: SaleLine[] = []
  for (const [orderId, rows] of byOrder) {
    const parts = allocateRefund(rows.map((r) => Number(r.amount)), refundOf.get(orderId) ?? 0)
    rows.forEach((r, i) =>
      lines.push({
        orderId,
        displayId: Number(rows[0].display_id),
        title: String(r.title ?? ""),
        variantTitle: String(r.variant_title ?? ""),
        createdAt: new Date(r.created_at),
        canceled: !!r.canceled,
        amount: Number(r.amount),
        quantity: Number(r.quantity),
        refunded: parts[i],
        dropId: dropOfProduct.get(r.product_id) ?? null,
      })
    )
  }
  return lines
}
