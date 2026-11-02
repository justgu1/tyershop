import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { addToCart, purchaseAndGenerate, tracking } from "./client"
import { buildCartPayload, DELIVERED, POSTED, senderFromEnv, serviceIdOf } from "./label"
import { buildPackage, loadShipments } from "./quote"
import { MELHOR_ENVIO_MODULE } from "./index"
import type MelhorEnvioModuleService from "./service"

/** Estado da etiqueta guardado em `order.metadata.melhor_envio`. */
export type LabelState = {
  status: "carrinho" | "gerada" | "postada" | "entregue" | "erro"
  me_order_id?: string
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

/**
 * Compra a etiqueta do pedido no Melhor Envio (cobra do saldo da conta) e cria o envio no Medusa, sem avisar o cliente:
 * o e-mail de despacho sai quando a transportadora registra a postagem (ver `syncShipments`). Idempotente: pedido com
 * etiqueta não compra de novo; um erro fica registrado no pedido e pode ser tentado outra vez.
 */
export async function purchaseLabel(scope: MedusaContainer, orderId: string): Promise<LabelState> {
  const logger = scope.resolve("logger") as any
  const order = await loadFullOrder(scope, orderId)
  if (!order) throw new Error("Pedido não encontrado.")
  const current = order.metadata?.melhor_envio as LabelState | undefined
  if (current && current.status !== "erro") return current

  const fail = async (message: string) => {
    logger.error(`[melhor-envio] pedido #${order.display_id}: ${message}`)
    return saveState(scope, order, { status: "erro", error: message.slice(0, 300), me_order_id: current?.me_order_id })
  }

  try {
    const { sender, missing } = senderFromEnv(process.env)
    if (!sender) return fail(`Dados do remetente incompletos: ${missing.join(", ")}.`)

    const method = order.shipping_methods?.[0]
    const serviceId = method ? serviceIdOf(method) : null
    if (!serviceId) return fail("Não identifiquei o serviço de entrega do pedido.")
    if (!order.shipping_address?.postal_code) return fail("O pedido não tem endereço de entrega.")

    const customerId = order.customer_id
    let cpf = ""
    if (customerId) {
      const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "customer", fields: ["metadata"], filters: { id: customerId } })
      cpf = String((data[0] as any)?.metadata?.cpf ?? "")
    }
    if (cpf.replace(/\D/g, "").length !== 11) return fail("O cliente não informou o CPF.")

    const token = await scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).accessToken()
    if (!token) return fail("O Melhor Envio não está conectado. Conecte de novo no admin.")

    const shipments = await loadShipments(
      scope,
      order.items.filter((i: any) => i.variant_id).map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity }))
    )
    const payload = buildCartPayload({ order, cpf, serviceId, sender, pkg: buildPackage(shipments) })

    let meId = current?.me_order_id
    if (!meId) {
      meId = (await addToCart(token, payload)).id
      await saveState(scope, order, { status: "carrinho", me_order_id: meId })
    }
    await purchaseAndGenerate(token, meId)
    const info = (await tracking(token, [meId]))[meId]
    const code = info?.tracking ?? null

    const fulfillment = await createOrderFulfillmentWorkflow(scope).run({
      input: { order_id: order.id, items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })), no_notification: true },
    })
    const state = await saveState(scope, order, {
      status: "gerada",
      me_order_id: meId,
      tracking_code: code,
      fulfillment_id: (fulfillment.result as any)?.id,
    })
    logger.info(`[melhor-envio] pedido #${order.display_id}: etiqueta ${meId} comprada`)
    return state
  } catch (err) {
    return fail((err as Error).message)
  }
}

/**
 * Acompanha as etiquetas: quando a transportadora registra a postagem cria o envio no Medusa com o rastreio (o cliente
 * recebe o e-mail de despacho); quando entrega, marca como entregue (e-mail de entrega).
 */
export async function syncShipments(scope: MedusaContainer) {
  const logger = scope.resolve("logger") as any
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000)
  const { data } = await scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "display_id", "metadata"],
    filters: { created_at: { $gte: since } },
  })
  const open = (data as any[]).filter((o) => ["gerada", "postada"].includes(o.metadata?.melhor_envio?.status) && o.metadata.melhor_envio.me_order_id)
  if (!open.length) return { checked: 0 }

  const token = await scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE).accessToken()
  if (!token) {
    logger.warn("[melhor-envio] sem token para acompanhar as etiquetas")
    return { checked: 0 }
  }
  const infos = await tracking(token, open.map((o) => o.metadata.melhor_envio.me_order_id))

  for (const summary of open) {
    const order = await loadFullOrder(scope, summary.id)
    if (!order) continue
    const state = order.metadata.melhor_envio as LabelState
    const info = infos[state.me_order_id!]
    if (!info?.status) continue
    const code = info.tracking ?? state.tracking_code ?? null
    try {
      let status = state.status
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
      }
      if (status === "postada" && DELIVERED.includes(info.status)) {
        await markOrderFulfillmentAsDeliveredWorkflow(scope).run({ input: { orderId: order.id, fulfillmentId: state.fulfillment_id! } })
        status = "entregue"
      }
      if (status !== state.status || code !== state.tracking_code) await saveState(scope, order, { ...state, status, tracking_code: code })
    } catch (err) {
      logger.error(`[melhor-envio] pedido #${order.display_id}: ${(err as Error).message}`)
    }
  }
  return { checked: open.length }
}
