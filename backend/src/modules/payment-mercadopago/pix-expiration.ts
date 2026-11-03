/** Validade do código Pix em minutos (o Mercado Pago deixa 24 h por padrão, longo demais para uma pré-venda). */
export const pixMinutes = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.PIX_EXPIRATION_MINUTES)
  return Number.isFinite(n) && n >= 5 && n <= 1440 ? Math.floor(n) : 30
}

/** `date_of_expiration` do Mercado Pago: horário de Brasília (-03:00, sem horário de verão), com milissegundos. */
export function pixExpiration(now: Date = new Date(), minutes: number = pixMinutes()) {
  const brasilia = new Date(now.getTime() + minutes * 60_000 - 3 * 3_600_000)
  return brasilia.toISOString().replace("Z", "-03:00")
}
