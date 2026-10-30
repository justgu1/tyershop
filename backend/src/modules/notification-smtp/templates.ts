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

const FONT = "Helvetica,Arial,sans-serif"

type Shell = {
  preheader: string
  title: string
  paragraphs: string[]
  cta?: { label: string; url: string }
  note?: string
  reason: string
}

/** Casca visual compartilhada por todos os e-mails: cabeçalho com logo, cartão, botão e rodapé. */
function shell({ preheader, title, paragraphs, cta, note, reason }: Shell): string {
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
    ${body}${button}${noteHtml}
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
  /** Ingresso individual da pré-venda de um drop. O botão entra direto na conta. */
  ticket: (d) => {
    const subject = `Seu ingresso para o drop ${d.drop_title}`
    const ends = fmtDate(d.presale_ends_at)
    const days = d.production_days ?? 21
    const reason = `Você recebeu este e-mail porque está na lista de convidados da Tyer (${esc(d.email)}). Não quer mais receber convites? É só responder esta mensagem.`

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
      note: `Este link é pessoal e entra na sua conta: não encaminhe este e-mail. Se o botão não funcionar, copie e cole no navegador:<br><span style="word-break:break-all;color:#6b6b6b">${esc(d.login_url)}</span>`,
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
      footerText(`Você recebeu este e-mail porque está na lista de convidados da Tyer (${d.email}). Para parar de receber convites, responda esta mensagem.`),
    ]
      .filter((l) => l !== undefined)
      .join("\n")

    return { subject, html, text }
  },
}

export function renderTemplate(template: string, data: TemplateData): RenderedEmail {
  const render = TEMPLATES[template]
  if (!render) throw new Error(`Template de e-mail desconhecido: ${template}`)
  return render(data)
}
