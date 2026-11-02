import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import Redis from "ioredis"

type Options = {
  windowMs: number
  max: number
  /** Teto somado de todos os visitantes na mesma janela. Só para quem gasta algo finito (e-mails do SMTP, chamadas ao Melhor Envio): em login e resgate bloquearia usuários legítimos. */
  globalMax?: number
  /** Chave extra além do IP (ex.: e-mail do corpo), para impedir spam contra uma pessoa só. */
  by?: (req: MedusaRequest) => string | undefined
  /** Falso: conta só pela chave `by` (limite por conta, sem somar quem divide o mesmo IP). */
  perIp?: boolean
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

/**
 * IP de quem chamou, sem confiar em cabeçalho que o próprio cliente escreve. Por padrão vale o último
 * item de `x-forwarded-for` (o que o proxy da frente acrescentou). Com o servidor aberto só à Cloudflare,
 * defina RATE_LIMIT_IP_HEADER=cf-connecting-ip para limitar por visitante em vez de por ponto de entrada da Cloudflare.
 */
export const clientIp = (req: MedusaRequest) => {
  const custom = process.env.RATE_LIMIT_IP_HEADER?.toLowerCase()
  const fromCustom = custom ? String(req.headers[custom] ?? "").split(",")[0].trim() : ""
  if (fromCustom) return fromCustom
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((p) => p.trim()).filter(Boolean)
  return forwarded[forwarded.length - 1] ?? req.socket?.remoteAddress ?? req.ip ?? ""
}

/**
 * Multiplica todos os limites (RATE_LIMIT_SCALE, padrão 1). Serve a uma janela de teste em que muita gente sai do mesmo IP;
 * fora dela a variável não existe.
 */
const scale = () => Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1)

/** Limite por janela; responde 429 ao exceder. */
export function rateLimit(name: string, { windowMs, max, by, globalMax, perIp = true }: Options) {
  return async (req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    // Só no ambiente de teste de carga: um gerador de carga sai de poucos IPs e bateria nos limites.
    if (process.env.LOAD_TEST_MODE === "true") return next()
    const keys = perIp ? [`${name}|ip|${clientIp(req)}`] : []
    if (globalMax) keys.push(`${name}|all`)
    const extra = by?.(req)
    if (extra) keys.push(`${name}|by|${extra.toLowerCase()}`)

    for (const key of keys) {
      if ((await hit(key, windowMs)) > (key.endsWith("|all") ? (globalMax as number) : max) * scale()) {
        res.setHeader("retry-after", Math.ceil(windowMs / 1000))
        return res.status(429).json({ type: "too_many_requests", message: "Muitas tentativas. Aguarde um pouco e tente de novo." })
      }
    }
    next()
  }
}

if (process.env.LOAD_TEST_MODE === "true") {
  console.warn("[rate-limit] LOAD_TEST_MODE ligado: limites de requisição desativados. Nunca use em produção.")
}

if (scale() > 1) console.warn(`[rate-limit] RATE_LIMIT_SCALE=${scale()}: limites multiplicados. Só para janelas de teste.`)

export const bodyEmail = (req: MedusaRequest) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const value = body.email ?? body.identifier
  return typeof value === "string" ? value.trim() : undefined
}
