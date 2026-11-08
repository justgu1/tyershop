import { createHmac, timingSafeEqual } from "crypto"
import { signingSecret, siteUrl } from "../../utils/signing-secret"

/** Redefinição de senha nunca tem página pública: o link dela dá acesso à conta. */
const NO_VIEW_PAGE = ["password_reset"]

export const canViewInBrowser = (template: string) => !NO_VIEW_PAGE.includes(template)

export const viewToken = (notificationId: string) =>
  createHmac("sha256", signingSecret()).update(`email-view:${notificationId}`).digest("hex").slice(0, 32)

export function validViewToken(notificationId: string, token: string): boolean {
  const expected = Buffer.from(viewToken(notificationId))
  const given = Buffer.from(String(token ?? ""))
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/** Link "ver este e-mail no navegador", ou undefined quando o e-mail não pode ter página pública. */
export const viewUrlFor = (template: string, notificationId?: string) =>
  notificationId && canViewInBrowser(template)
    ? `${siteUrl()}/email/${encodeURIComponent(notificationId)}?t=${viewToken(notificationId)}`
    : undefined
