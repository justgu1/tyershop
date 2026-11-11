/** Valor que o Medusa devolve como número, texto ou BigNumber (`{ value }` / `numeric`). */
export function toAmount(v: unknown): number {
  if (v && typeof v === "object") {
    const o = v as { numeric?: unknown; value?: unknown }
    return Number(o.numeric ?? o.value ?? 0) || 0
  }
  return Number(v ?? 0) || 0
}

export const sumRefunds = (refunds: { amount?: unknown }[]): number => Math.round(refunds.reduce((s, r) => s + toAmount(r.amount), 0) * 100) / 100

/** O cancelamento já avisa do estorno que ele mesmo faz; o e-mail de estorno é só para pedido que segue ativo. */
export const shouldEmailRefund = (orderStatus?: string | null) => orderStatus !== "canceled"
