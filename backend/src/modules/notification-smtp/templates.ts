export type RenderedEmail = { subject: string; html: string; text: string }

type TemplateData = Record<string, any>

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const fmtDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    : ""

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;color:#fff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#e77e23;font-weight:700;padding-bottom:12px">Tyer</td></tr>
<tr><td style="font-size:28px;font-weight:800;text-transform:uppercase;padding-bottom:16px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#e5e5e5">${bodyHtml}</td></tr>
${
  cta
    ? `<tr><td style="padding-top:24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#e77e23;color:#fff;text-decoration:none;font-weight:800;text-transform:uppercase;letter-spacing:.04em;font-size:13px;padding:14px 22px;border-radius:8px">${esc(cta.label)}</a></td></tr>`
    : ""
}
</table></td></tr></table></body></html>`
}

const TEMPLATES: Record<string, (d: TemplateData) => RenderedEmail> = {
  /** Ingresso individual da pré-venda de um drop. */
  ticket: (d) => {
    const subject = `Seu ingresso para o drop ${d.drop_title}`
    const ends = fmtDate(d.presale_ends_at)
    const lines = [
      `Você está na lista do drop <strong>${esc(d.drop_title)}</strong>.`,
      `A pré-venda é só para convidados: entre na sua conta no site com este e-mail (${esc(d.email)}) e o ingresso já vale. Até 2 peças de cada produto por pessoa.`,
      ends ? `A pré-venda termina em ${esc(ends)}.` : "",
      `Produção em até ${esc(d.production_days ?? 21)} dias, mais o prazo da transportadora.`,
    ].filter(Boolean)
    const html = layout(`Seu ingresso, ${d.name || "bem-vindo"}`, lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join(""), {
      label: "Entrar na pré-venda",
      url: d.drop_url,
    })
    const text = [
      `Seu ingresso para o drop ${d.drop_title}`,
      "",
      `Entre na sua conta com este e-mail (${d.email}) para comprar na pré-venda. Até 2 peças de cada produto por pessoa.`,
      ends ? `A pré-venda termina em ${ends}.` : "",
      `Produção em até ${d.production_days ?? 21} dias, mais o prazo da transportadora.`,
      "",
      d.drop_url,
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
