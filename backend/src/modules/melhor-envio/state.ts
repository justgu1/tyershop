import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import Redis from "ioredis"

const MAX_AGE_MS = 15 * 60 * 1000

function secret() {
  const value = process.env.COOKIE_SECRET
  if (!value || value === "supersecret") throw new Error("COOKIE_SECRET precisa estar definido para assinar o state do OAuth")
  return value
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex")

/** `state` do OAuth: assinado, com validade e um código único, para o callback aceitar só autorizações iniciadas pelo admin. */
export function signState(now = Date.now()) {
  const payload = `${now}.${randomBytes(12).toString("hex")}`
  return `${payload}.${sign(payload)}`
}

/** Confere assinatura e validade; devolve o código único (para consumir uma vez) ou null. */
export function verifyState(state: unknown, now = Date.now()): string | null {
  const [ts, nonce, sig] = String(state ?? "").split(".")
  if (!ts || !nonce || !sig || Math.abs(now - Number(ts)) > MAX_AGE_MS) return null
  const want = Buffer.from(sign(`${ts}.${nonce}`), "hex")
  const given = Buffer.from(sig, "hex")
  return given.length === want.length && timingSafeEqual(given, want) ? nonce : null
}

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null
redis?.on("error", () => {
  /* sem Redis o controle de reuso cai para a memória desta instância */
})
const used = new Map<string, number>()

/** Marca o state como usado; false se já foi usado (reaproveitar o mesmo link de autorização não vale). */
export async function consumeState(nonce: string): Promise<boolean> {
  if (redis) {
    try {
      return (await redis.set(`me-state:${nonce}`, "1", "PX", MAX_AGE_MS, "NX")) === "OK"
    } catch {
      /* cai para a memória */
    }
  }
  const now = Date.now()
  for (const [k, t] of used) if (now - t > MAX_AGE_MS) used.delete(k)
  if (used.has(nonce)) return false
  used.set(nonce, now)
  return true
}
