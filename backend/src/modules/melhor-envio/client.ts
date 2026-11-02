export type MelhorEnvioEnv = "sandbox" | "production"

export type ServiceQuote = {
  id: number
  name: string
  price: number
  delivery_time: number
  delivery_range?: { min: number; max: number }
  company: { name: string }
  error?: string
}

export type Package = { height: number; width: number; length: number; weight: number }

/** `MELHOR_ENVIO_BASE_URL` só existe para apontar um simulador em desenvolvimento. */
export const baseUrl = (env: MelhorEnvioEnv = (process.env.MELHOR_ENVIO_ENV as MelhorEnvioEnv) || "sandbox") =>
  process.env.MELHOR_ENVIO_BASE_URL?.replace(/\/$/, "") ||
  (env === "production" ? "https://melhorenvio.com.br" : "https://sandbox.melhorenvio.com.br")

const userAgent = () => `Tyer (${process.env.MELHOR_ENVIO_CONTACT_EMAIL || "contato@tyershop.com"})`

export const oauthConfig = () => ({
  clientId: process.env.MELHOR_ENVIO_CLIENT_ID ?? "",
  clientSecret: process.env.MELHOR_ENVIO_CLIENT_SECRET ?? "",
  redirectUri: process.env.MELHOR_ENVIO_REDIRECT_URI ?? "",
})

/** Cotação mais o que a compra da etiqueta usa (carrinho, pagamento com o saldo, geração e rastreio). */
export const SCOPES = "shipping-calculate cart-read cart-write shipping-checkout shipping-generate shipping-print shipping-tracking shipping-cancel"

export function authorizeUrl(state: string) {
  const { clientId, redirectUri } = oauthConfig()
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
  })
  return `${baseUrl()}/oauth/authorize?${q.toString()}`
}

export type TokenResponse = { access_token: string; refresh_token: string; expires_in: number }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = oauthConfig()
  const res = await fetch(`${baseUrl()}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": userAgent() },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, ...body }),
    signal: AbortSignal.timeout(10_000),
  })
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse>
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(`Melhor Envio recusou a autorização (${res.status})`)
  }
  return data as TokenResponse
}

export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code })
export const refreshToken = (refresh_token: string) => tokenRequest({ grant_type: "refresh_token", refresh_token })

export async function calculate(accessToken: string, input: { fromZip: string; toZip: string; pkg: Package; insurance: number }) {
  const res = await fetch(`${baseUrl()}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": userAgent(),
    },
    body: JSON.stringify({
      from: { postal_code: input.fromZip },
      to: { postal_code: input.toZip },
      package: input.pkg,
      options: { receipt: false, own_hand: false, insurance_value: input.insurance },
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (res.status === 401) throw Object.assign(new Error("token inválido"), { code: "unauthorized" })
  if (!res.ok) throw new Error(`Melhor Envio respondeu ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : []) as ServiceQuote[]
}


/** Acesso recusado pelo Melhor Envio (token sem o escopo da operação, conta bloqueada, etc.); guarda o motivo devolvido. */
export class UnauthorizedError extends Error {
  constructor(public detail: string) {
    super(`Melhor Envio recusou o acesso${detail ? `: ${detail}` : ""}`)
  }
}

async function meRequest<T>(accessToken: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}/api/v2/me${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": userAgent(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as any
  const detail = String(data?.message || (data?.errors ? JSON.stringify(data.errors).slice(0, 300) : "")).slice(0, 300)
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError(detail)
  if (!res.ok) {
    throw new Error(`Melhor Envio respondeu ${res.status}${detail ? `: ${detail}` : ""}`)
  }
  return data as T
}

/** Põe o envio no carrinho do Melhor Envio; devolve o id da etiqueta. */
export async function addToCart(accessToken: string, payload: Record<string, unknown>): Promise<{ id: string }> {
  return meRequest(accessToken, "/cart", payload)
}

/** Compra a etiqueta com o saldo da conta. */
export async function checkoutLabel(accessToken: string, id: string): Promise<void> {
  await meRequest(accessToken, "/shipment/checkout", { orders: [id] })
}

export async function generateLabel(accessToken: string, id: string): Promise<void> {
  await meRequest(accessToken, "/shipment/generate", { orders: [id] })
}

export type TrackingInfo = { status?: string; tracking?: string | null; melhorenvio_tracking?: string | null }

export async function tracking(accessToken: string, ids: string[]): Promise<Record<string, TrackingInfo>> {
  return meRequest(accessToken, "/shipment/tracking", { orders: ids })
}

async function meGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}/api/v2/me${path}`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "user-agent": userAgent() },
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as any
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError(String(data?.message ?? "").slice(0, 300))
  if (!res.ok) throw new Error(`Melhor Envio respondeu ${res.status}`)
  return data as T
}

/** Situação da etiqueta no Melhor Envio (pending = no carrinho, ainda não paga). Lança erro se não conseguir consultar. */
export async function getLabel(accessToken: string, id: string): Promise<{ status?: string }> {
  return meGet(accessToken, `/orders/${encodeURIComponent(id)}`)
}

type CartPage = { data?: { id: string; status?: string; tags?: { tag?: string }[] }[]; last_page?: number }
const CART_PAGES_MAX = 10

/** Procura no carrinho do Melhor Envio um envio já criado para o pedido (pela etiqueta "Pedido #N"). Erro de consulta é erro: não se cria outro às cegas. */
export async function findInCart(accessToken: string, tag: string): Promise<string | null> {
  for (let page = 1; page <= CART_PAGES_MAX; page++) {
    const cart = await meGet<CartPage>(accessToken, `/cart?page=${page}`)
    const hit = (cart.data ?? []).find((o) => (o.tags ?? []).some((t) => t.tag === tag) && o.status !== "canceled")
    if (hit) return hit.id
    if (page >= (cart.last_page ?? 1)) break
  }
  return null
}
