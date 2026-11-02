import { createHmac, timingSafeEqual } from "crypto"

const secret = () => process.env.COOKIE_SECRET || "dev-secret"
const MAX_AGE_MS = 15 * 60 * 1000

/** `state` do OAuth: assinado e com validade, para o callback aceitar só autorizações iniciadas pelo admin. */
export function signState(now = Date.now()) {
  const ts = String(now)
  return `${ts}.${createHmac("sha256", secret()).update(ts).digest("hex")}`
}

export function verifyState(state: unknown, now = Date.now()) {
  const [ts, sig] = String(state ?? "").split(".")
  if (!ts || !sig || Math.abs(now - Number(ts)) > MAX_AGE_MS) return false
  const want = createHmac("sha256", secret()).update(ts).digest()
  const given = Buffer.from(sig, "hex")
  return given.length === want.length && timingSafeEqual(given, want)
}
