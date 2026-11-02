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

export function authorizeUrl(state: string) {
  const { clientId, redirectUri } = oauthConfig()
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "shipping-calculate",
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
