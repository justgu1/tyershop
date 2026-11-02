import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { DROP_MODULE } from "./index"
import DropModuleService from "./service"
import { presentDrop } from "./present"
import { hasTicket } from "../ticket/access"

export const MAX_PER_PRODUCT_PRESALE = 2

/**
 * add/pay: o drop precisa estar à venda agora.
 * complete: o pagamento já foi feito; fechar o drop no meio do Pix/boleto não pode perder o pedido.
 */
export type CartCheckMode = "add" | "pay" | "complete"

export type CartLine = { product_id: string; quantity: number; item_id?: string }

const query = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.QUERY)

const deny = (message: string) => new MedusaError(MedusaError.Types.NOT_ALLOWED, message)

async function dropRows(scope: MedusaContainer) {
  const { data } = await query(scope).graph({ entity: "drop", fields: ["id", "products.id"] })
  const drops = scope.resolve<DropModuleService>(DROP_MODULE)
  return Promise.all(
    (data as any[]).map(async (row) => ({
      drop: await drops.retrieveDrop(row.id),
      productIds: new Set<string>((row.products ?? []).map((p: { id: string }) => p.id)),
    }))
  )
}

/** Pedidos não cancelados a partir de `from` (opcionalmente só de um cliente), paginados. */
async function ordersSince(scope: MedusaContainer, from: Date, to: Date | null, customerId?: string) {
  const out: { created_at: string; items: { product_id: string | null; quantity: number }[] }[] = []
  const take = 200
  for (let skip = 0; ; skip += take) {
    const { data } = await query(scope).graph({
      entity: "order",
      fields: ["id", "status", "created_at", "items.product_id", "items.quantity"],
      filters: { ...(customerId ? { customer_id: customerId } : {}), created_at: { $gte: from } },
      pagination: { skip, take, order: { created_at: "ASC" } },
    })
    for (const o of data as any[]) {
      if (o.status === "canceled") continue
      if (to && new Date(o.created_at) >= to) continue
      out.push(o)
    }
    if ((data as any[]).length < take) break
  }
  return out
}

function sumByProduct(orders: Awaited<ReturnType<typeof ordersSince>>, only: Set<string>) {
  const total = new Map<string, number>()
  for (const o of orders) {
    for (const it of o.items ?? []) {
      if (!it.product_id || !only.has(it.product_id)) continue
      total.set(it.product_id, (total.get(it.product_id) ?? 0) + Number(it.quantity))
    }
  }
  return total
}

/**
 * Peças de carrinhos do cliente que já têm pagamento criado no Mercado Pago e ainda não viraram pedido
 * (Pix e boleto levam tempo). Sem isso, dois pagamentos simultâneos furariam o limite por pessoa.
 */
async function reservedByProduct(scope: MedusaContainer, customerId: string, excludeCartId?: string) {
  const { data } = await query(scope).graph({
    entity: "cart",
    fields: ["id", "items.product_id", "items.quantity", "payment_collection.payment_sessions.data"],
    filters: { customer_id: customerId, completed_at: null },
    pagination: { take: 50 },
  })
  const total = new Map<string, number>()
  for (const cart of data as any[]) {
    if (cart.id === excludeCartId) continue
    const paying = (cart.payment_collection?.payment_sessions ?? []).some(
      (s: any) => s.data?.mp_payment_id && !["rejected", "cancelled"].includes(s.data?.mp_status)
    )
    if (!paying) continue
    for (const it of cart.items ?? []) {
      if (it.product_id) total.set(it.product_id, (total.get(it.product_id) ?? 0) + Number(it.quantity))
    }
  }
  return total
}

/**
 * Regras de compra dos produtos de drop para um carrinho (já com tudo que ficaria nele):
 * em breve não vende; encerrado só deixa concluir pedido já pago; pré-venda exige ingresso resgatado
 * e limita a 2 peças por produto por pessoa, contando o que ela já comprou na pré-venda;
 * venda geral respeita o lote. Produto fora de qualquer drop não passa por aqui.
 */
export async function assertCartAllowed(
  scope: MedusaContainer,
  input: { customerId?: string | null; lines: CartLine[]; mode: CartCheckMode; excludeCartId?: string }
) {
  const { customerId, lines, mode, excludeCartId } = input
  if (!lines.length) return

  const qtyByProduct = new Map<string, number>()
  for (const l of lines) qtyByProduct.set(l.product_id, (qtyByProduct.get(l.product_id) ?? 0) + Number(l.quantity))

  for (const { drop, productIds } of await dropRows(scope)) {
    const inDrop = [...qtyByProduct.keys()].filter((id) => productIds.has(id))
    if (!inDrop.length) continue

    const { phase } = presentDrop(drop)

    if (phase === "coming_soon") throw deny(`O drop ${drop.title} ainda não abriu.`)
    if (phase === "ended" && mode !== "complete") throw deny(`O drop ${drop.title} já encerrou.`)

    if (phase === "presale") {
      if (!(await hasTicket(scope, drop.id, customerId))) {
        throw deny("A pré-venda é exclusiva para convidados. Entre pelo link do ingresso enviado ao seu e-mail.")
      }
      const until = drop.general_starts_at ?? drop.preorder_ends_at
      const bought = customerId
        ? sumByProduct(await ordersSince(scope, new Date(drop.preorder_starts_at), new Date(until), customerId), productIds)
        : new Map<string, number>()
      const reserved = customerId && mode === "pay" ? await reservedByProduct(scope, customerId, excludeCartId) : new Map<string, number>()
      for (const id of inDrop) {
        if ((bought.get(id) ?? 0) + (reserved.get(id) ?? 0) + (qtyByProduct.get(id) ?? 0) > MAX_PER_PRODUCT_PRESALE) {
          throw deny(`Limite de ${MAX_PER_PRODUCT_PRESALE} peças de cada produto por pessoa na pré-venda.`)
        }
      }
    }

    if (phase === "general" && drop.general_lot && mode !== "complete") {
      const from = new Date(drop.general_starts_at ?? drop.preorder_ends_at)
      const sold = [...sumByProduct(await ordersSince(scope, from, null), productIds).values()].reduce((a, b) => a + b, 0)
      const wanted = inDrop.reduce((a, id) => a + (qtyByProduct.get(id) ?? 0), 0)
      if (sold + wanted > drop.general_lot) throw deny("O lote da venda geral esgotou.")
    }
  }
}

/** Variantes → linhas com product_id. */
export async function linesFromVariants(scope: MedusaContainer, items: { variant_id?: string | null; quantity: number }[]) {
  const ids = items.map((i) => i.variant_id).filter(Boolean) as string[]
  if (!ids.length) return []
  const { data } = await query(scope).graph({ entity: "variant", fields: ["id", "product_id"], filters: { id: ids } })
  const productOf = new Map((data as any[]).map((v) => [v.id, v.product_id as string]))
  return items
    .filter((i) => i.variant_id && productOf.get(i.variant_id))
    .map((i) => ({ product_id: productOf.get(i.variant_id!)!, quantity: Number(i.quantity) }))
}

/** Linhas atuais de um carrinho, com o cliente dono dele. */
export async function loadCart(scope: MedusaContainer, cartId: string) {
  const { data } = await query(scope).graph({
    entity: "cart",
    fields: ["id", "customer_id", "items.id", "items.product_id", "items.variant_id", "items.quantity"],
    filters: { id: cartId },
  })
  const cart = (data as any[])[0]
  if (!cart) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Carrinho não encontrado")
  return {
    customerId: cart.customer_id as string | null,
    lines: (cart.items ?? [])
      .filter((i: any) => i.product_id)
      .map((i: any) => ({ item_id: i.id as string, product_id: i.product_id as string, quantity: Number(i.quantity) })) as CartLine[],
  }
}

/**
 * Produtos de drop que este cliente não pode nem ver agora: em breve, encerrado,
 * ou em pré-venda sem ingresso resgatado. Produtos fora de qualquer drop nunca entram.
 */
export async function blockedProductIds(scope: MedusaContainer, customerId?: string | null): Promise<Set<string>> {
  const blocked = new Set<string>()
  for (const { drop, productIds } of await dropRows(scope)) {
    const { phase } = presentDrop(drop)
    const allowed = phase === "general" || (phase === "presale" && (await hasTicket(scope, drop.id, customerId)))
    if (!allowed) productIds.forEach((id) => blocked.add(id))
  }
  return blocked
}
