export type DropPhase = "coming_soon" | "presale" | "general" | "ended"

export type DropSchedule = {
  preorder_starts_at: Date | string
  preorder_ends_at: Date | string
  general_starts_at?: Date | string | null
  general_ends_at: Date | string
  general_lot?: number | null
  sell_until_sold_out?: boolean | null
  closed_at?: Date | string | null
}

const ts = (v: Date | string) => new Date(v).getTime()

/**
 * Fase derivada só de datas + lote. `generalSold` é quanto do lote já foi vendido;
 * sem lote definido a venda geral só fecha pela data final.
 */
export function resolveDropPhase(
  drop: DropSchedule,
  now: Date = new Date(),
  generalSold = 0
): DropPhase {
  const t = now.getTime()
  if (drop.closed_at && ts(drop.closed_at) <= t) return "ended"
  if (t < ts(drop.preorder_starts_at)) return "coming_soon"

  const generalStart = ts(drop.general_starts_at ?? drop.preorder_ends_at)
  if (t < generalStart) return "presale"

  // Com a venda até durar o estoque, a data final não encerra: quem fecha é o estoque de cada variante (ou closed_at).
  if (!drop.sell_until_sold_out && t >= ts(drop.general_ends_at)) return "ended"
  if (drop.general_lot != null && generalSold >= drop.general_lot) return "ended"
  return "general"
}

export function nextPhaseChange(drop: DropSchedule, phase: DropPhase): Date | null {
  switch (phase) {
    case "coming_soon":
      return new Date(drop.preorder_starts_at)
    case "presale":
      return new Date(drop.general_starts_at ?? drop.preorder_ends_at)
    case "general":
      return drop.sell_until_sold_out ? null : new Date(drop.general_ends_at)
    default:
      return null
  }
}
