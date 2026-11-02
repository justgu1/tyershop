import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { addToCart, checkoutLabel, generateLabel, tracking, UnauthorizedError } from "./client"
import { buildCartPayload, DELIVERED, POSTED, senderFromEnv, serviceIdOf } from "./label"
import { buildPackage, loadShipments } from "./quote"
import { MELHOR_ENVIO_MODULE } from "./index"
import type MelhorEnvioModuleService from "./service"

/** Estado da etiqueta guardado em `order.metadata.melhor_envio`. */
export type LabelState = {
  status: "carrinho" | "gerada" | "postada" | "entregue" | "erro"
  me_order_id?: string
  /** Etapas já cumpridas no Melhor Envio: uma nova tentativa retoma de onde parou, sem pagar duas vezes. */
  paid?: boolean
  generated?: boolean
  fulfillment_id?: string
  tracking_code?: string | null
  error?: string
  updated_at: string
}

export const autoLabelEnabled = () => (process.env.MELHOR_ENVIO_AUTO_LABEL ?? "").trim().toLowerCase() === "true"
const trackingUrl = (code: string) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`

/** Pelo módulo de pedidos: o grafo de consulta não devolve a quantidade dos itens. */
async function loadFullOrder(scope: MedusaContainer, orderId: string) {
  try {
    return (await scope.resolve(Modules.ORDER).retrieveOrder(orderId, {
      select: ["id", "display_id", "email", "customer_id", "metadata"],
      relations: ["items", "shipping_address", "shipping_methods"],
    })) as any
  } catch {
    return null
  }
}

async function saveState(scope: MedusaContainer, order: { id: string; metadata?: Record<string, any> | null }, state: Omit<LabelState, "updated_at">) {
  const next: LabelState = { ...(order.metadata?.melhor_envio ?? {}), ...state, updated_at: new Date().toISOString() }
  if (state.status !== "erro") delete next.error
  await scope.resolve(Modules.ORDER).updateOrders(order.id, { metadata: { ...(order.metadata ?? {}), melhor_envio: next } })
  order.metadata = { ...(order.metadata ?? {}), melhor_envio: next }
  return next
}

const SCOPE_HINT = "O Melhor Envio recusou o acesso. A autorização antiga só calcula frete: reconecte o Melhor Envio no admin para liberar a compra de etiquetas."

/** Uma execução por vez para cada chave (clique duplo, duas réplicas, subscriber e admin ao mesmo tempo). */
async function withLock<T>(scope: MedusaContainer, key: string, fn: () => Promise<T>, busy: () => T | Promise<T>): Promise<T> {
  const locking = scope.resolve(Modules.LOCKING) as any
  try {
    return await locking.execute(key, fn, { timeout: 1 })
  } catch (err) {
    if (/timed out|acquire/i.test((err as Error).message)) return busy()
    throw err
  }
}

async function cpfOf(scope: MedusaContainer, order: any): Promise<string> {
  const candidates: unknown[] = [order.metadata?.cpf, order.shipping_address?.metadata?.cpf]
  if (order.customer_id) {
    const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "customer", fields: ["metadata"], filters: { id: order.customer_id } })
    candidates.unshift((data[0] as any)?.metadata?.cpf)
  }
  return candidates.map((c) => String(c ?? "").replace(/\D/g, "")).find((c) => c.length === 11) ?? ""
}

/**
 * Compra a etiqueta do pedido no Melhor Envio (cobra do saldo da conta) e cria o envio no Medusa, sem avisar o cliente:
 * o e-mail de despacho sai quando a transportadora registra a postagem (ver `syncShipments`). Cada etapa fica gravada no
 * pedido, então um erro no meio e uma nova tentativa retomam de onde pararam, sem pagar a etiqueta duas vezes.
 */
export async function purchaseLabel(scope: MedusaContainer, orderId: string): Promise<LabelState> {
  return withLock(
    scope,
    `melhor-envio-label:${orderId}`,
    () => purchaseLabelLocked(scope, orderId),
    async () => {
      const order = await loadFullOrder(scope, orderId)
      return (order?.metadata?.melhor_envio as LabelState) ?? ({ status: "carrinho", updated_at: new Date().toISOString() } as LabelState)
    }
  )
}

async function purchaseLabelLocked(scope: MedusaContainer, orderId: string): Promise<LabelState> {
  const logger = scope.resolve("logger") as any
  const order = await loadFullOrder(scope, orderId)
  if (!order) throw new Error("Pedido não encontrado.")
  const current = order.metadata?.melhor_envio as LabelState | undefined
  if (current && current.status !== "erro") return current

  const fail = async (message: string) => {
    logger.error(`[melhor-envio] pedido #${order.display_id}: ${message}`)
    return saveState(scope, order, { status: "erro", error: message.slice(0, 300) })
  }

  try {
    const { sender, missing } = senderFromEnv(process.env)
    if (!sender) return await fail(`Dados do remetente incompletos: ${missing.join(", ")}.`)

    const method = order.shipping_methods?.[0]
    const serviceId = method ? serviceIdOf(method) : null
    if (!serviceId) return await fail("Não identifiquei o serviço de entrega do pedido.")
    if (!order.shipping_address?.postal_code) return await fail("O pedido não tem endereço de entrega.")

    const cpf = await cpfOf(scope, order)
    if (!cpf) return await fail("Não encontrei o CPF do cliente no cadastro nem no pedido.")

    const token = await scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).accessToken()
    if (!token) return await fail("O Melhor Envio não está conectado. Conecte de novo no admin.")

    let meId = current?.me_order_id
    if (!meId) {
      const shipments = await loadShipments(
        scope,
        order.items.filter((i: any) => i.variant_id).map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity }))
      )
      meId = (await addToCart(token, buildCartPayload({ order, cpf, serviceId, sender, pkg: buildPackage(shipments) }))).id
      await saveState(scope, order, { status: "carrinho", me_order_id: meId })
    }
    if (!current?.paid) {
      await checkoutLabel(token, meId)
      await saveState(scope, order, { status: "carrinho", paid: true })
    }
    if (!current?.generated) {
      await generateLabel(token, meId)
      await saveState(scope, order, { status: "carrinho", generated: true })
    }

    const info = (await tracking(token, [meId]).catch(() => ({} as Record<string, any>)))[meId]
    let fulfillmentId = current?.fulfillment_id
    if (!fulfillmentId) {
      const created = await createOrderFulfillmentWorkflow(scope).run({
        input: { order_id: order.id, items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })), no_notification: true },
      })
      fulfillmentId = (created.result as any)?.id
    }
    const state = await saveState(scope, order, { status: "gerada", tracking_code: info?.tracking ?? null, fulfillment_id: fulfillmentId })
    logger.info(`[melhor-envio] pedido #${order.display_id}: etiqueta ${meId} comprada`)
    return state
  } catch (err) {
    return fail(err instanceof UnauthorizedError ? SCOPE_HINT : (err as Error).message)
  }
}

const TRACKING_CHUNK = 50

/**
 * Acompanha as etiquetas: quando a transportadora registra a postagem cria o envio no Medusa com o rastreio (o cliente
 * recebe o e-mail de despacho); quando entrega, marca como entregue (e-mail de entrega). Confere o estado real do envio
 * antes de agir, então repetir a rodada depois de uma falha não duplica envio nem e-mail.
 */
export async function syncShipments(scope: MedusaContainer) {
  return withLock(scope, "sync-melhor-envio", () => syncShipmentsLocked(scope), () => ({ checked: 0 }))
}

async function syncShipmentsLocked(scope: MedusaContainer) {
  const logger = scope.resolve("logger") as any
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000)
  const { data } = await query.graph({ entity: "order", fields: ["id", "display_id", "metadata"], filters: { created_at: { $gte: since } } })
  const open = (data as any[]).filter((o) => ["gerada", "postada"].includes(o.metadata?.melhor_envio?.status) && o.metadata.melhor_envio.me_order_id)
  if (!open.length) return { checked: 0 }

  const token = await scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).accessToken()
  if (!token) {
    logger.warn("[melhor-envio] sem token para acompanhar as etiquetas")
    return { checked: 0 }
  }

  const infos: Record<string, any> = {}
  for (let i = 0; i < open.length; i += TRACKING_CHUNK) {
    const chunk = open.slice(i, i + TRACKING_CHUNK)
    try {
      Object.assign(infos, await tracking(token, chunk.map((o) => o.metadata.melhor_envio.me_order_id)))
    } catch (err) {
      logger.error(`[melhor-envio] rastreio indisponível: ${(err as Error).message}`)
    }
  }

  for (const summary of open) {
    try {
      const order = await loadFullOrder(scope, summary.id)
      if (!order) continue
      const state = order.metadata.melhor_envio as LabelState
      const info = infos[state.me_order_id!]
      if (!info?.status) continue
      const code = info.tracking ?? state.tracking_code ?? null

      const { data: fulfillments } = await query.graph({ entity: "fulfillment", fields: ["id", "shipped_at", "delivered_at"], filters: { id: state.fulfillment_id! } })
      const real = fulfillments[0] as any
      if (!real) continue

      let status: LabelState["status"] = real.delivered_at ? "entregue" : real.shipped_at ? "postada" : "gerada"
      if (status === "gerada" && POSTED.includes(info.status)) {
        await createOrderShipmentWorkflow(scope).run({
          input: {
            order_id: order.id,
            fulfillment_id: state.fulfillment_id!,
            items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })),
            labels: code ? [{ tracking_number: code, tracking_url: trackingUrl(code), label_url: trackingUrl(code) }] : [],
          },
        })
        status = "postada"
        await saveState(scope, order, { status, tracking_code: code })
      }
      if (status === "postada" && DELIVERED.includes(info.status)) {
        await markOrderFulfillmentAsDeliveredWorkflow(scope).run({ input: { orderId: order.id, fulfillmentId: state.fulfillment_id! } })
        status = "entregue"
      }
      if (status !== state.status || code !== state.tracking_code) await saveState(scope, order, { status, tracking_code: code })
    } catch (err) {
      logger.error(`[melhor-envio] pedido #${summary.display_id}: ${(err as Error).message}`)
    }
  }
  return { checked: open.length }
}
