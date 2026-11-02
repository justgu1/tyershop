import { SERVICES } from "./quote"

/** Remetente: quem aparece na etiqueta. Tudo vem do ambiente; sem os campos obrigatórios a compra automática não roda. */
export type Sender = {
  name: string
  phone: string
  email: string
  document: string
  address: string
  complement?: string
  number: string
  district: string
  city: string
  state_abbr: string
  postal_code: string
  company_document?: string
  state_register?: string
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "")

export function senderFromEnv(env: Record<string, string | undefined>): { sender: Sender | null; missing: string[] } {
  const get = (k: string) => (env[`MELHOR_ENVIO_SENDER_${k}`] ?? "").trim()
  const required = ["NAME", "PHONE", "EMAIL", "DOCUMENT", "ADDRESS", "NUMBER", "DISTRICT", "CITY", "STATE"]
  const missing = required.filter((k) => !get(k))
  const zip = digits(env.MELHOR_ENVIO_FROM_ZIP)
  if (zip.length !== 8) missing.push("FROM_ZIP")
  if (missing.length) return { sender: null, missing }
  return {
    sender: {
      name: get("NAME"),
      phone: digits(get("PHONE")),
      email: get("EMAIL"),
      document: digits(get("DOCUMENT")),
      address: get("ADDRESS"),
      complement: get("COMPLEMENT") || undefined,
      number: get("NUMBER"),
      district: get("DISTRICT"),
      city: get("CITY"),
      state_abbr: get("STATE").toUpperCase(),
      postal_code: zip,
      company_document: digits(get("COMPANY_DOCUMENT")) || undefined,
      state_register: get("STATE_REGISTER") || undefined,
    },
    missing: [],
  }
}

/** Serviço do Melhor Envio da compra: pelo nome do método de envio ("PAC") ou pelo id da opção ("melhorenvio-1"). */
export function serviceIdOf(method: { name?: string | null; data?: Record<string, any> | null }): number | null {
  const fromData = String(method.data?.id ?? "").replace("melhorenvio-", "")
  if (fromData in SERVICES) return Number(fromData)
  const byName = Object.entries(SERVICES).find(([, name]) => name.toLowerCase() === String(method.name ?? "").trim().toLowerCase())
  return byName ? Number(byName[0]) : null
}

type OrderForLabel = {
  display_id: number | string
  email?: string | null
  items: { title?: string | null; product_title?: string | null; quantity: number; unit_price: number }[]
  shipping_address: {
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    metadata?: Record<string, any> | null
  }
}

export function buildCartPayload(input: {
  order: OrderForLabel
  cpf: string
  serviceId: number
  sender: Sender
  pkg: { height: number; width: number; length: number; weight: number }
  /** Ponto de postagem da Jadlog onde o remetente deixa os pacotes (exigido pelos serviços .Com e .Package). */
  agency?: number | null
}) {
  const { order, sender, pkg } = input
  const a = order.shipping_address
  const insurance = Math.round(order.items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0) * 100) / 100
  return {
    service: input.serviceId,
    ...(input.agency ? { agency: input.agency } : {}),
    from: {
      name: sender.name,
      phone: sender.phone,
      email: sender.email,
      document: sender.document,
      company_document: sender.company_document,
      state_register: sender.state_register,
      address: sender.address,
      complement: sender.complement,
      number: sender.number,
      district: sender.district,
      city: sender.city,
      country_id: "BR",
      postal_code: sender.postal_code,
      state_abbr: sender.state_abbr,
    },
    to: {
      name: [a.first_name, a.last_name].filter(Boolean).join(" ").trim(),
      phone: digits(a.phone),
      email: order.email ?? undefined,
      document: digits(input.cpf),
      address: a.address_1 ?? "",
      number: a.address_2 ?? "",
      district: String(a.metadata?.neighborhood ?? ""),
      city: a.city ?? "",
      country_id: "BR",
      postal_code: digits(a.postal_code),
      state_abbr: String(a.province ?? "").toUpperCase(),
    },
    products: order.items.map((i) => ({ name: i.product_title || i.title || "Peça Tyer", quantity: i.quantity, unitary_value: i.unit_price })),
    volumes: [{ height: pkg.height, width: pkg.width, length: pkg.length, weight: pkg.weight }],
    options: {
      insurance_value: insurance,
      receipt: false,
      own_hand: false,
      reverse: false,
      // Declaração de conteúdo no lugar da nota fiscal: vale para envio de pessoa física/MEI ao consumidor.
      non_commercial: true,
      platform: "Tyer",
      tags: [{ tag: `Pedido #${order.display_id}`, url: null }],
    },
  }
}

/** Status do Melhor Envio que já contam como "despachado" e "entregue". */
export const POSTED = ["posted", "delivered"]
export const DELIVERED = ["delivered"]

/** Serviços da Jadlog: só aceitam o envio com o ponto de postagem informado. */
export const NEEDS_AGENCY = [3, 4]

export const agencyFromEnv = (env: Record<string, string | undefined>) => Number(env.MELHOR_ENVIO_AGENCY_ID) || null
