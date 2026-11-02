export type TestModeConfig = { enabled: boolean; to?: string }

export function readTestMode(env: Record<string, string | undefined>): TestModeConfig {
  const flag = (env.EMAIL_TEST_MODE ?? "").trim().toLowerCase()
  return {
    enabled: !["false", "0", "off", "no"].includes(flag),
    to: env.EMAIL_TEST_TO?.trim() || undefined,
  }
}

export type Envelope = { to: string; subject: string; redirectedFrom?: string }

/**
 * Com o modo de teste ligado (padrão), nada sai para o cliente: tudo vai para
 * o e-mail de teste, com o destinatário original avisado no corpo. Sem e-mail de teste configurado o envio é recusado, em
 * vez de cair no endereço real.
 */
export function resolveRecipient(original: string, subject: string, cfg: TestModeConfig): Envelope {
  if (!cfg.enabled) return { to: original, subject }
  if (!cfg.to) {
    throw new Error("EMAIL_TEST_MODE está ligado mas EMAIL_TEST_TO não foi definido")
  }
  // O assunto fica igual ao real (prefixos como "[TESTE]" pesam contra o e-mail nos filtros de spam); o aviso vai no corpo.
  return { to: cfg.to, subject, redirectedFrom: original }
}

/** Endereços do domínio reservado `.invalid` nunca existem: não se envia (nem em modo de teste), só se registra. */
export const isUndeliverable = (address: string) => /\.invalid$/i.test(address.trim())

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Em modo de teste avisa, no fim do e-mail (o topo é o texto de pré-visualização), para quem ele iria de verdade; o assunto
 * fica igual ao real.
 */
export function applyTestModeNote(mail: { html: string; text: string }, redirectedFrom?: string) {
  if (!redirectedFrom) return mail
  const note = `Modo de teste: este e-mail seria enviado para ${redirectedFrom}.`
  const banner = `<div style="background:#fff7ed;color:#9a3412;font:12px Helvetica,Arial,sans-serif;padding:8px 12px;text-align:center">${escapeHtml(note)}</div>`
  const closing = /<\/body\s*>/i
  return {
    html: closing.test(mail.html) ? mail.html.replace(closing, (m) => `${banner}${m}`) : `${mail.html}${banner}`,
    text: `${mail.text}\n\n${note}`,
  }
}

/** Destinatário e assunto de um envio: redefinição de senha vai sempre ao destinatário real, o resto segue o modo de teste. */
export function envelopeFor(template: string, original: string, subject: string, cfg: TestModeConfig): Envelope {
  return template === "password_reset" ? { to: original, subject } : resolveRecipient(original, subject, cfg)
}
