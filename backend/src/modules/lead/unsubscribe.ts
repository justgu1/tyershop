import { createHmac, timingSafeEqual } from "crypto"
import { signingSecret as secret, siteUrl } from "../../utils/signing-secret"

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
