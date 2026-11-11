export type Bounce = { messageId: string; recipient: string | null; status: string | null; reason: BounceReason; diagnostic: string | null }
export type BounceReason = "caixa_cheia" | "endereco_inexistente" | "recusado"

export const headerOf = (raw: string, name: string) => raw.match(new RegExp(`^${name}:[ \\t]*(.+(?:\\r?\\n[ \\t]+.+)*)`, "im"))?.[1].replace(/\r?\n[ \t]+/g, " ").trim() ?? null

export function bounceReason(status: string | null, diagnostic: string | null): BounceReason {
  const d = diagnostic ?? ""
  if (/^[45]\.2\.2$/.test(status ?? "") || /over quota|out of storage|mailbox (is )?full/i.test(d)) return "caixa_cheia"
  if (status === "5.1.1" || /user unknown|does not exist|no such user|invalid recipient/i.test(d)) return "endereco_inexistente"
  return "recusado"
}

/** Só o relatório definitivo (`Action: failed`) vale; o Message-ID é o do nosso domínio, na cópia da mensagem original. */
export function parseBounce(raw: string, ownDomain: string): Bounce | null {
  if ((headerOf(raw, "Action") ?? "").toLowerCase() !== "failed") return null
  const domain = ownDomain.replace(/^@/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const messageId = raw.match(new RegExp(`^message-id:[ \\t]*(<[^>\\r\\n]+@${domain}>)`, "im"))?.[1]
  if (!messageId) return null
  const status = headerOf(raw, "Status")?.match(/\d\.\d+\.\d+/)?.[0] ?? null
  const diagnostic = headerOf(raw, "Diagnostic-Code")?.replace(/^smtp;\s*/i, "").slice(0, 500) ?? null
  const recipient = headerOf(raw, "Final-Recipient")?.replace(/^rfc822;\s*/i, "").trim().toLowerCase() ?? null
  return { messageId, recipient, status, reason: bounceReason(status, diagnostic), diagnostic }
}

export const REASON_LABEL: Record<BounceReason, string> = {
  caixa_cheia: "caixa de entrada do cliente cheia",
  endereco_inexistente: "endereço de e-mail não existe",
  recusado: "recusado pelo servidor do cliente",
}
