export type InboxFolder = "Devolvidos" | "Respostas de clientes" | "Copias - Pedidos" | "Copias - Drop" | "Copias - Outros" | "Outros"

export type InboxMessage = { from: string; subject: string; autoSubmitted?: string | null }

const ORDER_COPY = /^(Pedido #\d+ (confirmado|a caminho|entregue|cancelado)|Estorno do pedido #\d+|Nota fiscal do pedido #\d+)/
const DROP_COPY = /(Seu ingresso para o drop|Você está na lista do drop)/

/** Pasta de cada mensagem da caixa de suporte; só a resposta de cliente é encaminhada. */
export function classifyInbox(m: InboxMessage, ownDomain: string): { folder: InboxFolder; customerReply: boolean } {
  const from = m.from.toLowerCase()
  const own = from.endsWith(`@${ownDomain.toLowerCase()}`)
  if (/mailer-daemon|postmaster/.test(from) || /undelivered mail|delivery status notification|returned mail/i.test(m.subject)) return { folder: "Devolvidos", customerReply: false }
  if (own) {
    if (ORDER_COPY.test(m.subject)) return { folder: "Copias - Pedidos", customerReply: false }
    if (DROP_COPY.test(m.subject)) return { folder: "Copias - Drop", customerReply: false }
    return { folder: "Copias - Outros", customerReply: false }
  }
  const automatic = !!m.autoSubmitted && m.autoSubmitted.toLowerCase() !== "no"
  if (automatic || /@([\w-]+\.)*hostinger\.com$/.test(from) || /no-?reply/.test(from)) return { folder: "Outros", customerReply: false }
  return { folder: "Respostas de clientes", customerReply: true }
}

export const INBOX_FOLDERS: InboxFolder[] = ["Devolvidos", "Respostas de clientes", "Copias - Pedidos", "Copias - Drop", "Copias - Outros", "Outros"]

/** Primeiro `text/plain` da mensagem (quoted-printable ou base64, em UTF-8), para a prévia do encaminhamento. */
export function plainTextOf(raw: string): string | null {
  const headEnd = raw.search(/\r?\n\r?\n/)
  if (headEnd < 0) return null
  const head = raw.slice(0, headEnd)
  const decode = (headers: string, body: string) => {
    const enc = headers.match(/content-transfer-encoding:\s*(\S+)/i)?.[1]?.toLowerCase()
    if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8")
    if (enc === "quoted-printable") {
      const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      return Buffer.from(bytes, "latin1").toString("utf8")
    }
    return body
  }
  const boundary = head.match(/boundary="?([^";\r\n]+)"?/i)?.[1]
  if (!boundary) return /content-type:\s*text\/plain/i.test(head) || !/content-type/i.test(head) ? decode(head, raw.slice(headEnd).trim()).trim() : null
  for (const part of raw.slice(headEnd).split(`--${boundary}`)) {
    const end = part.search(/\r?\n\r?\n/)
    if (end < 0) continue
    const h = part.slice(0, end)
    if (/content-type:\s*text\/plain/i.test(h)) return decode(h, part.slice(end).trim()).trim()
    if (/content-type:\s*multipart\//i.test(h)) {
      const inner = plainTextOf(part.replace(/^\r?\n/, ""))
      if (inner) return inner
    }
  }
  return null
}
