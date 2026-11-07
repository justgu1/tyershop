import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { calculate, type Package } from "./client"
import { MELHOR_ENVIO_MODULE } from "./index"
import MelhorEnvioModuleService from "./service"
import { dropRows } from "../drop/access"
import { presentDrop } from "../drop/present"

/** Identificador da opção de envio de um serviço (`data.id`): o checkout, o teste de carga e a etiqueta casam a opção por ele. */
export const shippingOptionDataId = (serviceId: string | number) => `melhorenvio-${serviceId}`

const CORREIOS: Record<string, string> = {
  "1": "PAC",
  "2": "SEDEX",
  "17": "Mini Envios",
}

// A conta de sandbox do Melhor Envio só cota Jadlog; sem isso a homologação não tem frete e ninguém chega ao pagamento.
const SANDBOX_ONLY: Record<string, string> = { "3": ".Package", "4": ".Com" }

/** Serviços oferecidos na loja (ids do Melhor Envio): só Correios; o sandbox soma a Jadlog para testes. */
export const servicesFor = (env?: string): Record<string, string> => (env === "sandbox" ? { ...CORREIOS, ...SANDBOX_ONLY } : CORREIOS)

export const SERVICES = servicesFor(process.env.MELHOR_ENVIO_ENV)

export type Shipment = { variant_id: string; quantity: number; weight?: number | null; length?: number | null; width?: number | null; height?: number | null }

export type Quote = {
  id: string
  name: string
  company: string
  price: number
  delivery_min: number
  delivery_max: number
}

const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback)

export const normalizeZip = (v: unknown) => String(v ?? "").replace(/\D/g, "")

/** Um único pacote: peso somado, maior comprimento e largura, alturas empilhadas (mínimos do Melhor Envio). */
export function buildPackage(items: Shipment[]): Package {
  const d = {
    weightG: num(process.env.MELHOR_ENVIO_DEFAULT_WEIGHT_G, 400),
    length: num(process.env.MELHOR_ENVIO_DEFAULT_LENGTH_CM, 30),
    width: num(process.env.MELHOR_ENVIO_DEFAULT_WIDTH_CM, 25),
    height: num(process.env.MELHOR_ENVIO_DEFAULT_HEIGHT_CM, 5),
  }
  let weightG = 0
  let length = 0
  let width = 0
  let height = 0
  for (const it of items) {
    const q = Math.max(1, Math.floor(Number(it.quantity) || 1))
    weightG += num(it.weight, d.weightG) * q
    length = Math.max(length, num(it.length, d.length))
    width = Math.max(width, num(it.width, d.width))
    height += num(it.height, d.height) * q
  }
  return {
    weight: Math.max(0.1, Math.round(weightG) / 1000),
    length: Math.max(16, Math.ceil(length)),
    width: Math.max(11, Math.ceil(width)),
    height: Math.max(2, Math.ceil(height)),
  }
}

const cache = new Map<string, { at: number; quotes: Quote[] }>()
const TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 500

function remember(key: string, quotes: Quote[]) {
  const now = Date.now()
  for (const [k, v] of cache) if (now - v.at >= TTL_MS) cache.delete(k)
  while (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: now, quotes })
}

/** Cotação do pacote para o CEP; guarda por 10 minutos para não estourar o limite do Melhor Envio. */
export async function quotePackage(scope: MedusaContainer, toZip: string, pkg: Package): Promise<Quote[]> {
  const zip = normalizeZip(toZip)
  if (zip.length !== 8) throw new MedusaError(MedusaError.Types.INVALID_DATA, "CEP inválido.")
  const fromZip = normalizeZip(process.env.MELHOR_ENVIO_FROM_ZIP)
  if (fromZip.length !== 8) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "CEP de origem do frete não configurado.")

  const key = `${zip}|${pkg.weight}|${pkg.length}|${pkg.width}|${pkg.height}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.quotes

  const module = scope.resolve<MelhorEnvioModuleService>(MELHOR_ENVIO_MODULE)
  const token = await module.accessToken()
  if (!token) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "O cálculo de frete está indisponível no momento.")

  let raw
  try {
    raw = await calculate(token, { fromZip, toZip: zip, pkg, insurance: 0 })
  } catch (err) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Não foi possível calcular o frete agora. Tente de novo.")
  }

  const quotes = raw
    .filter((s) => !s.error && String(s.id) in SERVICES && Number.isFinite(Number((s as any).custom_price ?? s.price)))
    .map((s) => ({
      id: String(s.id),
      name: SERVICES[String(s.id)],
      company: s.company?.name ?? "",
      price: Math.round(Number((s as any).custom_price ?? s.price) * 100) / 100,
      delivery_min: Number(s.delivery_range?.min ?? s.delivery_time) || 0,
      delivery_max: Number(s.delivery_range?.max ?? s.delivery_time) || 0,
    }))
    .sort((a, b) => a.price - b.price)

  remember(key, quotes)
  return quotes
}

/** Maior prazo de produção entre os produtos de drops à venda agora (peças fixas, como a Starter, não têm). */
export async function productionDaysOfProducts(scope: MedusaContainer, productIds: string[]): Promise<number> {
  let days = 0
  for (const { drop, productIds: dropProducts } of await dropRows(scope)) {
    const { phase } = presentDrop(drop)
    if ((phase === "presale" || phase === "general") && productIds.some((p) => dropProducts.has(p))) {
      days = Math.max(days, Number(drop.production_days) || 0)
    }
  }
  return days
}

/** Mesma regra, a partir das variantes do carrinho. */
export async function productionDays(scope: MedusaContainer, variantIds: string[]): Promise<number> {
  if (!variantIds.length) return 0
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "variant", fields: ["id", "product_id"], filters: { id: variantIds } })
  return productionDaysOfProducts(scope, (data as any[]).map((v) => v.product_id))
}

/** Variantes com peso e medidas, na quantidade pedida, prontas para montar o pacote. */
export async function loadShipments(scope: MedusaContainer, items: { variant_id: string; quantity: number }[]): Promise<Shipment[]> {
  const ids = items.map((i) => i.variant_id)
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "variant", fields: ["id", "weight", "length", "width", "height"], filters: { id: ids } })
  const byId = new Map((data as any[]).map((v) => [v.id, v]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Produto não encontrado.")
  return items.map((i) => ({ ...byId.get(i.variant_id), variant_id: i.variant_id, quantity: i.quantity }))
}

/**
 * O Medusa não recalcula o frete quando o endereço muda depois de escolhido o envio. Antes de cobrar e antes de
 * concluir, o valor gravado no carrinho precisa bater com a cotação do CEP e das peças de agora.
 */
export async function assertShippingCurrent(scope: MedusaContainer, cartId: string) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: [
      "id",
      "shipping_address.postal_code",
      "items.variant_id",
      "items.quantity",
      "items.variant.weight",
      "items.variant.length",
      "items.variant.width",
      "items.variant.height",
      "shipping_methods.amount",
      "shipping_methods.shipping_option_id",
    ],
    filters: { id: cartId },
  })
  const cart = (data as any[])[0]
  const method = cart?.shipping_methods?.[0]
  if (!cart?.items?.length) return
  if (!method) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Escolha a forma de entrega.")

  const { data: options } = await query.graph({ entity: "shipping_option", fields: ["id", "provider_id", "data"], filters: { id: method.shipping_option_id } })
  const option = (options as any[])[0]
  if (option?.provider_id !== "melhorenvio_melhorenvio") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Forma de entrega inválida. Escolha a entrega de novo.")
  }

  const shipments: Shipment[] = cart.items.map((i: any) => ({
    variant_id: i.variant_id,
    quantity: i.quantity,
    weight: i.variant?.weight,
    length: i.variant?.length,
    width: i.variant?.width,
    height: i.variant?.height,
  }))
  const serviceId = String(option.data?.id ?? "").replace("melhorenvio-", "")
  const fresh = (await quotePackage(scope, cart.shipping_address?.postal_code, buildPackage(shipments))).find((q) => q.id === serviceId)
  if (!fresh || Math.abs(fresh.price - Number(method.amount)) > 0.009) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "O frete mudou para este endereço. Volte e escolha a entrega de novo.")
  }
}
