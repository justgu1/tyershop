import { createHmac, timingSafeEqual } from "crypto"

const secret = () => {
  const value = process.env.JWT_SECRET
  if (value) return value
  // Sem segredo em produção qualquer um calcularia o token: recusa em vez de usar o valor padrão conhecido.
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET não está definido")
  return "supersecret"
}
const siteUrl = () => (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")

/** Assinatura do e-mail: só quem recebeu a mensagem tem o link, e ele não serve para sair com o e-mail de outra pessoa. */
export const unsubscribeToken = (email: string) =>
  createHmac("sha256", secret()).update(`unsubscribe:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32)

export function validUnsubscribeToken(email: string, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(email))
  const given = Buffer.from(String(token ?? ""))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const unsubscribeUrl = (email: string) =>
  `${siteUrl()}/sair-da-lista?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubscribeToken(email)}`
