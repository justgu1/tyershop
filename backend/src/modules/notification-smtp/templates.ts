import { LOGO_HEIGHT, LOGO_WIDTH } from "./logo"

export type RenderedEmail = { subject: string; html: string; text: string }

type TemplateData = Record<string, any>

export const LOGO_CID = "tyer-logo"

const ACCENT = "#e77e23"
const SUPPORT_EMAIL = "suporte@tyershop.com"
const SOCIAL = [
  { label: "Instagram", url: "https://www.instagram.com/tyer_br" },
  { label: "TikTok", url: "https://www.tiktok.com/@tyer_br" },
  { label: "YouTube", url: "https://www.youtube.com/@tyer_br" },
]

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    : ""

const brl = (v: unknown, currency = "BRL") =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: String(currency || "BRL").toUpperCase() })

/** Convite para sair da lista: link próprio (um clique) quando há, ou resposta ao e-mail. */
const leave = (d: TemplateData) =>
  d.unsubscribe_url ? `<a href="${esc(d.unsubscribe_url)}" style="color:#ffffff">Cancelar inscrição</a>.` : "É só responder esta mensagem."

const FONT = "Helvetica,Arial,sans-serif"

type Shell = {
  preheader: string
  title: string
  paragraphs: string[]
  blocks?: string
  cta?: { label: string; url: string }
  note?: string
  reason: string
}

/** Casca visual compartilhada por todos os e-mails: cabeçalho com logo, cartão, botão e rodapé. */
function shell({ preheader, title, paragraphs, blocks, cta, note, reason }: Shell): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2b2b">${p}</p>`).join("")
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td bgcolor="${ACCENT}" style="border-radius:8px">
<a href="${esc(cta.url)}" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#ffffff;text-decoration:none">${esc(cta.label)}</a>
</td></tr></table>`
    : ""
  const noteHtml = note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b">${note}</p>` : ""
  const social = SOCIAL.map((s) => `<a href="${s.url}" style="color:#ffffff;text-decoration:none">${s.label}</a>`).join(
    `<span style="color:#555555">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`
  )

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#efefef">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#efefef">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#efefef"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
  <tr><td align="center" bgcolor="#0b0b0b" style="padding:28px 24px;border-radius:12px 12px 0 0">
    <img src="cid:${LOGO_CID}" width="${Math.round(LOGO_WIDTH / 2.4)}" height="${Math.round(LOGO_HEIGHT / 2.4)}" alt="TYER" style="display:block;border:0;outline:none">
  </td></tr>
  <tr><td height="4" bgcolor="${ACCENT}" style="font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td bgcolor="#ffffff" style="padding:40px 36px 36px;font-family:${FONT}">
    <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;font-weight:800;text-transform:uppercase;color:#0b0b0b">${esc(title)}</h1>
    ${body}${blocks ?? ""}${button}${noteHtml}
  </td></tr>
  <tr><td align="center" bgcolor="#0b0b0b" style="padding:28px 24px;border-radius:0 0 12px 12px;font-family:${FONT}">
    <p style="margin:0 0 14px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${social}</p>
    <p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:#9a9a9a">${reason}</p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#9a9a9a">Dúvidas? Fale com a gente em <a href="mailto:${SUPPORT_EMAIL}" style="color:#ffffff">${SUPPORT_EMAIL}</a><br>© ${new Date().getFullYear()} Tyer. Todos os direitos reservados.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

const footerText = (reason: string) =>
  [
    "",
    "—",
    reason,
    `Dúvidas? ${SUPPORT_EMAIL}`,
    SOCIAL.map((s) => `${s.label}: ${s.url}`).join(" | "),
  ].join("\n")

const TEMPLATES: Record<string, (d: TemplateData) => RenderedEmail> = {
  /** Redefinição de senha da conta do cliente. */
  password_reset: (d) => {
    const subject = "Redefinição de senha — Tyer"
    const reason = `Você recebeu este e-mail porque alguém pediu a redefinição de senha da conta ${esc(d.email)}. Se não foi você, é só ignorar: nada muda na sua conta.`
    const html = shell({
      preheader: "Crie uma nova senha para a sua conta Tyer.",
      title: "Redefinir senha",
      paragraphs: [
        "Recebemos um pedido para redefinir a senha da sua conta Tyer.",
        "Clique no botão abaixo para escolher uma nova senha. O link vale por <strong>15 minutos</strong> e só pode ser usado uma vez.",
      ],
      cta: { label: "Criar nova senha", url: d.reset_url },
      note: `Se o botão não funcionar, copie e cole no navegador:<br><a href="${esc(d.reset_url)}" style="word-break:break-all;color:#6b6b6b">${esc(d.reset_url)}</a>`,
      reason,
    })
    const text = [
      "Recebemos um pedido para redefinir a senha da sua conta Tyer.",
      "",
      "Escolha uma nova senha pelo link abaixo (válido por 15 minutos, uso único):",
      d.reset_url,
      footerText(reason),
    ].join("\n")
    return { subject, html, text }
  },

  /** Confirmação de quem entrou na lista de um drop (ainda sem ingresso). */
  lead_welcome: (d) => {
    const subject = d.drop_title ? `Você está na lista do drop ${d.drop_title}` : "Você está na lista da Tyer"
    const reason = `Você recebeu este e-mail porque se cadastrou na lista da Tyer (${esc(d.email)}). Não quer mais receber avisos? ${leave(d)}`
    const what = d.drop_title ? `do drop <strong>${esc(d.drop_title)}</strong>` : "dos próximos drops"
    const paragraphs = [
      `Anotado! Seu e-mail está na lista ${what}. Assim que a pré-venda abrir, você é avisado por aqui.`,
      `Enquanto isso, entre no grupo da comunidade no WhatsApp e acompanhe a Tyer nas redes: é lá que os avisos saem primeiro.`,
    ]
    const html = shell({
      preheader: "Você está na lista. Avisamos por e-mail quando abrir.",
      title: "Você está na lista",
      paragraphs,
      cta: { label: "Entrar no grupo do WhatsApp", url: d.whatsapp_url },
      reason,
    })
    const text = [
      "Anotado! Seu e-mail está na lista.",
      "",
      "Assim que a pré-venda abrir, você é avisado por e-mail.",
      `Grupo do WhatsApp: ${d.whatsapp_url}`,
      footerText(`Você recebeu este e-mail porque se cadastrou na lista da Tyer (${d.email}). Para parar de receber avisos: ${d.unsubscribe_url ?? "responda esta mensagem."}`),
    ].join("\n")
    return { subject, html, text }
  },

  /** Ingresso individual da pré-venda de um drop. O botão entra direto na conta. */
  ticket: (d) => {
    const subject = `Seu ingresso para o drop ${d.drop_title}`
    const ends = fmtDate(d.presale_ends_at)
    const days = d.production_days ?? 21
    const reason = `Você recebeu este e-mail porque está na lista de convidados da Tyer (${esc(d.email)}). Não quer mais receber convites? ${leave(d)}`

    const html = shell({
      preheader: `Pré-venda exclusiva do drop ${d.drop_title}: seu acesso já está liberado.`,
      title: d.name ? `${d.name}, seu ingresso chegou` : "Seu ingresso chegou",
      paragraphs: [
        `Você está na lista de convidados do drop <strong>${esc(d.drop_title)}</strong>. A pré-venda é exclusiva e o seu acesso já está liberado.`,
        `Clique no botão abaixo: você entra direto na sua conta e vai para a pré-venda. Cada convidado pode levar até <strong>2 peças de cada produto</strong>.`,
        ends ? `A pré-venda vai até <strong>${esc(ends)}</strong>.` : "",
        `As peças são feitas sob encomenda, com produção em até <strong>${esc(days)} dias</strong>, mais o prazo da transportadora.`,
      ].filter(Boolean),
      cta: { label: "Entrar na pré-venda", url: d.login_url },
      note: `Este link é pessoal e entra na sua conta: não encaminhe este e-mail. Se o botão não funcionar, copie e cole no navegador:<br><a href="${esc(d.login_url)}" style="word-break:break-all;color:#6b6b6b">${esc(d.login_url)}</a>`,
      reason,
    })

    const text = [
      `${d.name ? `${d.name}, seu` : "Seu"} ingresso para o drop ${d.drop_title} chegou.`,
      "",
      "A pré-venda é exclusiva e o seu acesso já está liberado. Cada convidado pode levar até 2 peças de cada produto.",
      ends ? `A pré-venda vai até ${ends}.` : "",
      `Produção em até ${days} dias, mais o prazo da transportadora.`,
      "",
      "Entrar na pré-venda (link pessoal, não encaminhe):",
      d.login_url,
      footerText(`Você recebeu este e-mail porque está na lista de convidados da Tyer (${d.email}). Para parar de receber convites: ${d.unsubscribe_url ?? "responda esta mensagem."}`),
    ]
      .filter((l) => l !== undefined)
      .join("\n")

    return { subject, html, text }
  },
  /** Pedido recebido e pago. A nota fiscal segue em e-mail próprio, quando for emitida. */
  order_confirmation: (d) => {
    const subject = `Pedido #${d.display_id} confirmado`
    const reason = `Você recebeu este e-mail porque fez um pedido na Tyer com ${esc(d.email)}.`
    const items: { title: string; variant?: string; quantity: number; unit_price: number }[] = d.items ?? []
    const rows = items
      .map(
        (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:15px;color:#2b2b2b">${esc(i.title)}${
          i.variant ? `<br><span style="font-size:13px;color:#6b6b6b">${esc(i.variant)}</span>` : ""
        }</td><td align="center" style="padding:10px 8px;border-bottom:1px solid #eeeeee;font-size:15px;color:#2b2b2b">${esc(i.quantity)}x</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eeeeee;font-size:15px;color:#2b2b2b">${brl(
          i.unit_price * i.quantity,
          d.currency_code
        )}</td></tr>`
      )
      .join("")
    const totals = `<tr><td colspan="2" style="padding:10px 0 0;font-size:14px;color:#6b6b6b">Frete</td><td align="right" style="padding:10px 0 0;font-size:14px;color:#6b6b6b">${brl(d.shipping_total, d.currency_code)}</td></tr>
<tr><td colspan="2" style="padding:6px 0 0;font-size:17px;font-weight:700;color:#0b0b0b">Total</td><td align="right" style="padding:6px 0 0;font-size:17px;font-weight:700;color:#0b0b0b">${brl(d.total, d.currency_code)}</td></tr>`
    const blocks = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 8px">${rows}${totals}</table>${
      d.address ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#6b6b6b"><strong>Entrega em:</strong> ${esc(d.address)}</p>` : ""
    }`
    const prazo = d.production_days
      ? `As peças do drop são feitas sob encomenda: a produção leva até <strong>${esc(d.production_days)} dias</strong>, mais o prazo da transportadora.`
      : `Assim que o pedido for despachado, você recebe o código de rastreio por e-mail.`
    const html = shell({
      preheader: `Recebemos o pagamento do pedido #${d.display_id}.`,
      title: d.name ? `${d.name}, pedido confirmado` : "Pedido confirmado",
      paragraphs: [`Recebemos o pagamento do pedido <strong>#${esc(d.display_id)}</strong>. Obrigado por vestir a Tyer!`, prazo],
      blocks,
      cta: { label: "Acompanhar meu pedido", url: d.orders_url },
      note: "Guarde este e-mail: ele é o comprovante da sua compra. O pedido e a entrega também ficam em Meus pedidos.",
      reason,
    })
    const text = [
      `${d.name ? `${d.name}, p` : "P"}edido #${d.display_id} confirmado. Obrigado por vestir a Tyer!`,
      "",
      ...items.map((i) => `${i.quantity}x ${i.title}${i.variant ? ` (${i.variant})` : ""} — ${brl(i.unit_price * i.quantity, d.currency_code)}`),
      `Frete: ${brl(d.shipping_total, d.currency_code)}`,
      `Total: ${brl(d.total, d.currency_code)}`,
      d.address ? `Entrega em: ${d.address}` : "",
      "",
      d.production_days ? `Produção em até ${d.production_days} dias, mais o prazo da transportadora.` : "Você recebe o código de rastreio quando o pedido for despachado.",
      "Guarde este e-mail: ele é o comprovante da sua compra. O pedido e a entrega também ficam em Meus pedidos.",
      `Acompanhar: ${d.orders_url}`,
      footerText(reason),
    ]
      .join("\n")
    return { subject, html, text }
  },

  /** Pedido despachado, com o código de rastreio. */
  order_shipped: (d) => {
    const subject = `Pedido #${d.display_id} a caminho`
    const reason = `Você recebeu este e-mail porque fez um pedido na Tyer com ${esc(d.email)}.`
    const code = d.tracking_code ? esc(d.tracking_code) : ""
    const html = shell({
      preheader: `Seu pedido #${d.display_id} foi despachado.`,
      title: d.name ? `${d.name}, seu pedido saiu` : "Seu pedido saiu",
      paragraphs: [
        `O pedido <strong>#${esc(d.display_id)}</strong> foi despachado e já está com a transportadora.`,
        code ? `Código de rastreio: <strong>${code}</strong>` : "O código de rastreio aparece em Meus pedidos assim que a transportadora registrar a postagem.",
      ],
      cta: { label: d.tracking_url ? "Rastrear entrega" : "Ver meu pedido", url: d.tracking_url || d.orders_url },
      note: "O rastreio pode levar algumas horas para mostrar as primeiras atualizações.",
      reason,
    })
    const text = [
      `O pedido #${d.display_id} foi despachado.`,
      d.tracking_code ? `Código de rastreio: ${d.tracking_code}` : "",
      `${d.tracking_url ? "Rastrear" : "Ver pedido"}: ${d.tracking_url || d.orders_url}`,
      footerText(reason),
    ].join("\n")
    return { subject, html, text }
  },

  /** Pedido entregue. */
  order_delivered: (d) => {
    const subject = `Pedido #${d.display_id} entregue`
    const reason = `Você recebeu este e-mail porque fez um pedido na Tyer com ${esc(d.email)}.`
    const html = shell({
      preheader: `O pedido #${d.display_id} foi entregue.`,
      title: "Pedido entregue",
      paragraphs: [
        `O pedido <strong>#${esc(d.display_id)}</strong> foi entregue. Esperamos que você curta cada peça!`,
        "Se algo não estiver certo, fale com a gente em até 7 dias do recebimento.",
      ],
      cta: { label: "Ver meu pedido", url: d.orders_url },
      reason,
    })
    const text = [`O pedido #${d.display_id} foi entregue.`, "Se algo não estiver certo, fale com a gente em até 7 dias do recebimento.", `Ver pedido: ${d.orders_url}`, footerText(reason)].join("\n")
    return { subject, html, text }
  },

  /** Nota fiscal emitida; o PDF vai em anexo e também fica para baixar em Meus pedidos. */
  order_invoice: (d) => {
    const subject = `Nota fiscal do pedido #${d.display_id}`
    const reason = `Você recebeu este e-mail porque fez um pedido na Tyer com ${esc(d.email)}.`
    const html = shell({
      preheader: `A nota fiscal do pedido #${d.display_id} está em anexo.`,
      title: "Sua nota fiscal",
      paragraphs: [
        `Segue em anexo a nota fiscal${d.invoice_number ? ` <strong>nº ${esc(d.invoice_number)}</strong>` : ""} do pedido <strong>#${esc(d.display_id)}</strong>.`,
        "Você também pode baixá-la quando quiser na página Meus pedidos, depois de entrar na sua conta.",
      ],
      cta: { label: "Meus pedidos", url: d.orders_url },
      reason,
    })
    const text = [
      `Segue em anexo a nota fiscal${d.invoice_number ? ` nº ${d.invoice_number}` : ""} do pedido #${d.display_id}.`,
      `Você também pode baixá-la em Meus pedidos: ${d.orders_url}`,
      footerText(reason),
    ].join("\n")
    return { subject, html, text }
  },

}

export function renderTemplate(template: string, data: TemplateData): RenderedEmail {
  const render = TEMPLATES[template]
  if (!render) throw new Error(`Template de e-mail desconhecido: ${template}`)
  return render(data)
}
