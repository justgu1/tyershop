export type TestModeConfig = { enabled: boolean; to?: string }

export function readTestMode(env: Record<string, string | undefined>): TestModeConfig {
  const flag = (env.EMAIL_TEST_MODE ?? "").trim().toLowerCase()
  return {
    enabled: !["false", "0", "off", "no"].includes(flag),
    to: env.EMAIL_TEST_TO?.trim() || undefined,
  }
}

/**
 * Com o modo de teste ligado (padrão), nada sai para o cliente: tudo vai para
 * o e-mail de teste, com o destinatário original avisado no corpo. Sem e-mail de teste configurado o envio é recusado, em
 * vez de cair no endereço real.
 */
export function resolveRecipient(original: string, subject: string, cfg: TestModeConfig): { to: string; subject: string; redirectedFrom?: string } {
  if (!cfg.enabled) return { to: original, subject }
  if (!cfg.to) {
    throw new Error("EMAIL_TEST_MODE está ligado mas EMAIL_TEST_TO não foi definido")
  }
  // O assunto fica igual ao real (prefixos como "[TESTE]" pesam contra o e-mail nos filtros de spam); o aviso vai no corpo.
  return { to: cfg.to, subject, redirectedFrom: original }
}

/** Endereços do domínio reservado `.invalid` nunca existem: não se envia (nem em modo de teste), só se registra. */
export const isUndeliverable = (address: string) => /\.invalid$/i.test(address.trim())
