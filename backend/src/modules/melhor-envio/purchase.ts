import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"
import { addToCart, checkoutLabel, findInCart, generateLabel, getLabel, tracking, UnauthorizedError } from "./client"
import { buildCartPayload, DELIVERED, POSTED, senderFromEnv, serviceIdOf } from "./label"
import { buildPackage, loadShipments } from "./quote"
import { MELHOR_ENVIO_MODULE } from "./index"
import { setMetadataKey } from "../../utils/order-metadata"
import { loadOrder, trackingUrl } from "../../utils/order-email"
import type MelhorEnvioModuleService from "./service"

/** Estado da etiqueta guardado em `order.metadata.melhor_envio`. */
export type LabelState = {
  status: "carrinho" | "gerada" | "postada" | "entregue" | "erro"
  me_order_id?: string
  /** Etapas já cumpridas no Melhor Envio: uma nova tentativa retoma de onde parou, sem pagar duas vezes. */
  paid?: boolean
  generated?: boolean
  posted_seen_at?: string
  /** Quem iniciou a compra: só as automáticas são retomadas pelo job; as do admin são retomadas pelo admin. */
  origin?: "auto" | "manual"
  fulfillment_id?: string
  tracking_code?: string | null
  error?: string
  updated_at: string
}

export const autoLabelEnabled = () => (process.env.MELHOR_ENVIO_AUTO_LABEL ?? "").trim().toLowerCase() === "true"

async function saveState(scope: MedusaContainer, order: { id: string; metadata?: Record<string, any> | null }, state: Omit<LabelState, "updated_at">) {
  const next: LabelState = { ...(order.metadata?.melhor_envio ?? {}), ...state, updated_at: new Date().toISOString() }
  if (state.status !== "erro") delete next.error
  await setMetadataKey(scope, order.id, "melhor_envio", next)
  order.metadata = { ...(order.metadata ?? {}), melhor_envio: next }
  return next
}

/** Já existe uma execução para a mesma chave (clique duplo, subscriber e admin ao mesmo tempo, outra réplica). */
export class BusyError extends Error {
  constructor() {
    super("Já há uma compra em andamento para este pedido.")
  }
}

/** Uma execução por vez para cada chave; o lock é no banco, então vale entre réplicas. */
async function withLock<T>(scope: MedusaContainer, key: string, fn: () => Promise<T>): Promise<T> {
  const locking = scope.resolve(Modules.LOCKING) as any
  let started = false
  try {
    return await locking.execute(
      key,
      () => {
        started = true
        return fn()
      },
      { timeout: 1 }
    )
  } catch (err) {
    // Só é "ocupado" se a trava não foi obtida; um erro vindo de dentro de `fn` segue como erro.
    if (!started) throw new BusyError()
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
export async function purchaseLabel(scope: MedusaContainer, orderId: string, origin: "auto" | "manual" = "manual"): Promise<LabelState> {
  return withLock(scope, `melhor-envio-label:${orderId}`, () => purchaseLabelLocked(scope, orderId, origin))
}

const DONE: LabelState["status"][] = ["gerada", "postada", "entregue"]

async function purchaseLabelLocked(scope: MedusaContainer, orderId: string, origin: "auto" | "manual"): Promise<LabelState> {
  const logger = scope.resolve("logger") as any
  const order = await loadOrder(scope, orderId)
  if (!order) throw new Error("Pedido não encontrado.")
  const current = order.metadata?.melhor_envio as LabelState | undefined
  if (current && DONE.includes(current.status)) return current

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

    const tag = `Pedido #${order.display_id}`
    let meId = current?.me_order_id
    if (!meId) {
      // Se a resposta de uma tentativa anterior se perdeu, o envio já está no carrinho do Melhor Envio: reaproveita em vez de criar outro.
      meId = (await findInCart(token, tag)) ?? undefined
    }
    if (!meId) {
      const shipments = await loadShipments(
        scope,
        order.items.filter((i: any) => i.variant_id).map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity }))
      )
      meId = (await addToCart(token, buildCartPayload({ order, cpf, serviceId, sender, pkg: buildPackage(shipments) }))).id
    }
    if (meId !== current?.me_order_id) await saveState(scope, order, { status: "carrinho", me_order_id: meId, origin })

    // O estado remoto manda: uma compra ou geração que passou, mas cuja resposta se perdeu, não é refeita. Sem conseguir
    // consultar, não paga: melhor tentar de novo do que cobrar duas vezes.
    let paid = !!current?.paid
    let generated = !!current?.generated
    if (!paid || !generated) {
      const remote = (await getLabel(token, meId).catch((err) => {
        if (err instanceof UnauthorizedError) throw err
        throw new Error("Não consegui conferir a etiqueta no Melhor Envio. Tente de novo em instantes.")
      })).status
      if (remote && ["canceled", "undelivered", "paused", "suspended"].includes(remote)) {
        throw new Error(`A etiqueta está "${remote}" no Melhor Envio. Resolva por lá antes de tentar de novo.`)
      }
      paid = paid || (!!remote && remote !== "pending")
      generated = generated || (!!remote && ["generated", "posted", "delivered"].includes(remote))
    }
    if (!current?.paid) {
      if (!paid) await checkoutLabel(token, meId)
      await saveState(scope, order, { status: "carrinho", paid: true })
    }
    if (!current?.generated) {
      if (!generated) await generateLabel(token, meId)
      await saveState(scope, order, { status: "carrinho", generated: true })
    }

    const info = (await tracking(token, [meId]).catch(() => ({} as Record<string, any>)))[meId]
    let fulfillmentId = current?.fulfillment_id
    if (!fulfillmentId) {
      const created = await createOrderFulfillmentWorkflow(scope).run({
        input: { order_id: order.id, items: order.items.map((i: any) => ({ id: i.id, quantity: i.quantity })), no_notification: true },
      })
      fulfillmentId = (created.result as any)?.id
      // Grava já: se algo falhar daqui em diante, a nova tentativa não cria outro envio.
      await saveState(scope, order, { status: "carrinho", fulfillment_id: fulfillmentId })
    }
    const state = await saveState(scope, order, { status: "gerada", tracking_code: info?.tracking ?? null, fulfillment_id: fulfillmentId })
    logger.info(`[melhor-envio] pedido #${order.display_id}: etiqueta ${meId} comprada`)
    return state
  } catch (err) {
    return fail(
      err instanceof UnauthorizedError
        ? `${(err as Error).message}. Se o acesso foi concedido só para calcular frete, reconecte o Melhor Envio no admin.`
        : (err as Error).message
    )
  }
}

const TRACKING_CHUNK = 50
const NO_CODE_WAIT_MS = 48 * 3600 * 1000

/**
 * Acompanha as etiquetas: quando a transportadora registra a postagem cria o envio no Medusa com o rastreio (o cliente
 * recebe o e-mail de despacho); quando entrega, marca como entregue (e-mail de entrega). Confere o estado real do envio
 * antes de agir, então repetir a rodada depois de uma falha não duplica envio nem e-mail.
 */
export async function syncShipments(scope: MedusaContainer) {
  return withLock(scope, "sync-melhor-envio", () => syncShipmentsLocked(scope)).catch((err) => {
    if (err instanceof BusyError) return { checked: 0 }
    throw err
  })
}

async function syncShipmentsLocked(scope: MedusaContainer) {
  const logger = scope.resolve("logger") as any
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  // Só as etiquetas em aberto, filtradas no banco (o prazo longo cobre produção sob encomenda e postagens demoradas): sem etiquetas a rodada custa uma consulta barata.
  const pg = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const rows: { id: string; display_id: number; metadata: any }[] = (
    await pg.raw(
      `select id, display_id, metadata from "order"
        where deleted_at is null and created_at >= now() - interval '1 year'
          and metadata->'melhor_envio'->>'status' in ('gerada', 'postada')
          and metadata->'melhor_envio'->>'me_order_id' is not null`
    )
  ).rows
  const open = rows.filter((o) => o.metadata.melhor_envio.fulfillment_id)
  for (const o of rows) if (!o.metadata.melhor_envio.fulfillment_id) logger.warn(`[melhor-envio] pedido #${o.display_id}: etiqueta sem envio no Medusa; refaça pelo admin`)
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
      const order = await loadOrder(scope, summary.id)
      if (!order) continue
      const state = order.metadata.melhor_envio as LabelState
      const info = infos[state.me_order_id!]
      if (!info?.status) continue
      const code = info.tracking || state.tracking_code || info.melhorenvio_tracking || null

      const { data: fulfillments } = await query.graph({ entity: "fulfillment", fields: ["id", "shipped_at", "delivered_at"], filters: { id: state.fulfillment_id } })
      const real = fulfillments[0] as any
      if (!real) continue

      let status: LabelState["status"] = real.delivered_at ? "entregue" : real.shipped_at ? "postada" : "gerada"
      // O código de rastreio pode aparecer um pouco depois da postagem: espera até dois dias em vez de avisar sem código; passado o prazo avisa mesmo assim, para o pedido não ficar parado.
      if (status === "gerada" && info.status === "posted" && !code) {
        const seen = state.posted_seen_at ? new Date(state.posted_seen_at).getTime() : Date.now()
        if (!state.posted_seen_at) await saveState(scope, order, { ...state, posted_seen_at: new Date(seen).toISOString() })
        if (Date.now() - seen < NO_CODE_WAIT_MS) continue
      }
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

const MAX_RESUMED_PER_RUN = 5

/**
 * Retoma compras da compra automática que pararam no meio sem registrar erro (processo reiniciado, por exemplo). Fica fora da
 * trava do acompanhamento, que não pode esperar por chamadas lentas, e só roda com a compra automática ligada: uma compra
 * iniciada à mão pelo admin é retomada à mão.
 */
export async function resumeStuckPurchases(scope: MedusaContainer) {
  const logger = scope.resolve("logger") as any
  const pg = scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  const stuck: { id: string }[] = (
    await pg.raw(
      `select id from "order"
        where deleted_at is null and created_at >= now() - interval '1 year'
          and metadata->'melhor_envio'->>'status' = 'carrinho'
          and metadata->'melhor_envio'->>'origin' = 'auto'
          and (metadata->'melhor_envio'->>'updated_at')::timestamptz < now() - interval '15 minutes'
        order by (metadata->'melhor_envio'->>'updated_at')::timestamptz asc
        limit ?`,
      [MAX_RESUMED_PER_RUN]
    )
  ).rows
  for (const o of stuck) {
    await purchaseLabel(scope, o.id, "auto").catch(async (err) => {
      if (err instanceof BusyError) return
      logger.error(`[melhor-envio] retomada: ${err.message}`)
      // Sai da fila: sem isso o mesmo pedido, falhando antes de gravar o estado, ocuparia as vagas de todas as rodadas.
      await pg.raw(
        `update "order" set metadata = jsonb_set(metadata, '{melhor_envio}', (metadata->'melhor_envio') || jsonb_build_object('status', 'erro', 'error', ?::text, 'updated_at', now()::text)) where id = ?`,
        [String(err.message).slice(0, 300), o.id]
      )
    })
  }
}
