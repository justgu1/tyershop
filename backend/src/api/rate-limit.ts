import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import Redis from "ioredis"

type Options = {
  windowMs: number
  max: number
  /** Chave extra além do IP (ex.: e-mail do corpo), para impedir spam contra uma pessoa só. */
  by?: (req: MedusaRequest) => string | undefined
}

/** Contador compartilhado entre réplicas quando há Redis; sem ele (dev), cai para memória. */
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
  : null
redis?.on("error", () => {
  /* indisponível: o limite cai para a memória desta instância */
})

const memory = new Map<string, number[]>()
setInterval(() => {
  const now = Date.now()
  for (const [key, list] of memory) {
    const fresh = list.filter((t) => now - t < 3_600_000)
    if (fresh.length) memory.set(key, fresh)
    else memory.delete(key)
  }
}, 60_000).unref()

async function hit(key: string, windowMs: number): Promise<number> {
  if (redis) {
    try {
      const bucket = `rl:${key}:${Math.floor(Date.now() / windowMs)}`
      const count = await redis.incr(bucket)
      if (count === 1) await redis.pexpire(bucket, windowMs)
      return count
    } catch {
      /* cai para a memória */
    }
  }
  const now = Date.now()
  const list = (memory.get(key) ?? []).filter((t) => now - t < windowMs)
  list.push(now)
  memory.set(key, list)
  return list.length
}

const clientIp = (req: MedusaRequest) =>
  String(req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"] ?? req.ip ?? "")
    .split(",")[0]
    .trim()

/** Limite por janela; responde 429 ao exceder. */
export function rateLimit(name: string, { windowMs, max, by }: Options) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    const keys = [`${name}|ip|${clientIp(req)}`]
    const extra = by?.(req)
    if (extra) keys.push(`${name}|by|${extra.toLowerCase()}`)

    for (const key of keys) {
      if ((await hit(key, windowMs)) > max) {
        res.setHeader("retry-after", Math.ceil(windowMs / 1000))
        return res.status(429).json({ type: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco e tente de novo." })
      }
    }
    next()
  }
}

export const bodyEmail = (req: MedusaRequest) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const value = body.email ?? body.identifier
  return typeof value === "string" ? value.trim() : undefined
}
