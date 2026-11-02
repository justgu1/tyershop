import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

type Options = {
  windowMs: number
  max: number
  /** Chave extra além do IP (ex.: e-mail do corpo), para impedir spam contra uma pessoa só. */
  by?: (req: MedusaRequest) => string | undefined
}

const hits = new Map<string, number[]>()

setInterval(() => {
  const now = Date.now()
  for (const [key, list] of hits) {
    const fresh = list.filter((t) => now - t < 3_600_000)
    if (fresh.length) hits.set(key, fresh)
    else hits.delete(key)
  }
}, 60_000).unref()

const clientIp = (req: MedusaRequest) =>
  String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.ip ?? "")
    .split(",")[0]
    .trim()

/** Limite por janela deslizante, em memória (o backend roda em uma réplica). Responde 429 ao exceder. */
export function rateLimit(name: string, { windowMs, max, by }: Options) {
  return (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const keys = [`${name}|ip|${clientIp(req)}`]
    const extra = by?.(req)
    if (extra) keys.push(`${name}|by|${extra.toLowerCase()}`)

    const now = Date.now()
    for (const key of keys) {
      const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
      if (list.length >= max) {
        res.setHeader("retry-after", Math.ceil(windowMs / 1000))
        return res.status(429).json({ type: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco e tente de novo." })
      }
      list.push(now)
      hits.set(key, list)
    }
    next()
  }
}

export const bodyEmail = (req: MedusaRequest) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const value = body.email ?? body.identifier
  return typeof value === "string" ? value.trim() : undefined
}
