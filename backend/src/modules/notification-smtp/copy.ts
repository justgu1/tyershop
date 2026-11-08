// Redefinição de senha fica fora da cópia: o link dela dá acesso à conta e não deve ficar numa caixa compartilhada.
export function copyOptions(template: string, to: string, env: Record<string, string | undefined>) {
  const replyTo = env.SMTP_REPLY_TO?.trim() || undefined
  const bcc = env.SMTP_BCC?.trim() || undefined
  const copy = template !== "password_reset" && bcc && bcc.toLowerCase() !== to.trim().toLowerCase() ? bcc : undefined
  return { ...(replyTo ? { replyTo } : {}), ...(copy ? { bcc: copy } : {}) }
}
