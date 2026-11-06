export type SaleLine = {
  orderId: string
  displayId: number
  createdAt: Date
  canceled: boolean
  title: string
  /** Valor da linha em reais, antes de reembolso. */
  amount: number
  quantity: number
  /** Parcela do reembolso do pedido que cabe a esta linha, em reais. */
  refunded: number
  dropId: string | null
}

export type DropInfo = { id: string; handle: string; title: string; salesStart: Date }

export const STARTER_TAB = "Starter"
export const BASE_TAB = "Base de dados"
export const FIRST_DROP_NUMBER = 6
export const PHASE_PRESALE = "Pré-venda"
export const PHASE_GENERAL = "Venda global"
export const PHASE_STARTER = "Venda"
export const STATUS_ACTIVE = "Ativo"
export const STATUS_CANCELED = "Cancelado"

/** Única origem das colunas da Base de dados: só pedido, momento, produto e valores. Nada de cliente, contato, endereço ou pagamento. */
export const BASE_COLUMNS = ["Pedido", "Data e hora", "Dia", "Aba", "Fase", "Produto", "Quantidade", "Bruto", "Reembolsado", "Status"] as const

export type BaseRow = [number, number, number, string, string, string, number, number, number, string]

export type TabInfo = { name: string; split: boolean; days: number[] }

/** Número do drop a partir do handle `drop-N`; qualquer outro handle (drop-teste) não tem aba. */
export function dropNumber(handle: string): number | null {
  const m = /^drop-(\d+)$/.exec(handle)
  return m ? Number(m[1]) : null
}

export function tabName(drop: DropInfo): string {
  return `Drop ${dropNumber(drop.handle)}`
}

/** Data e hora de Brasília como número de planilha (dias desde 30/12/1899), onde a loja opera. */
export function sheetSerial(d: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, Number(x.value)])
  )
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 86_400_000 + 25569
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Venda dentro da pré-venda é a anterior ao início da venda geral do drop; a partir dali é venda global.
 * Só Starter e drops 6+ entram na base: drop de teste e drops antigos ficam de fora.
 */
export function buildBase(lines: SaleLine[], drops: DropInfo[]): { rows: BaseRow[]; tabs: TabInfo[] } {
  const eligible = drops.filter((d) => (dropNumber(d.handle) ?? 0) >= FIRST_DROP_NUMBER).sort((a, b) => dropNumber(a.handle)! - dropNumber(b.handle)!)
  const byId = new Map(drops.map((d) => [d.id, d]))
  const eligibleIds = new Set(eligible.map((d) => d.id))
  const days = new Map<string, Set<number>>()
  const rows: BaseRow[] = []

  for (const l of [...lines].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const drop = l.dropId ? byId.get(l.dropId) : undefined
    if (drop && !eligibleIds.has(drop.id)) continue
    const tab = drop ? tabName(drop) : STARTER_TAB
    const phase = !drop ? PHASE_STARTER : l.createdAt < drop.salesStart ? PHASE_PRESALE : PHASE_GENERAL
    const serial = sheetSerial(l.createdAt)
    const day = Math.floor(serial)
    days.set(tab, (days.get(tab) ?? new Set()).add(day))
    rows.push([l.displayId, serial, day, tab, phase, l.title, l.quantity, round(l.amount), round(l.refunded), l.canceled ? STATUS_CANCELED : STATUS_ACTIVE])
  }

  const tabs: TabInfo[] = [
    { name: STARTER_TAB, split: false, days: [...(days.get(STARTER_TAB) ?? [])].sort((a, b) => a - b) },
    ...eligible.map((d) => ({ name: tabName(d), split: true, days: [...(days.get(tabName(d)) ?? [])].sort((a, b) => a - b) })),
  ]
  return { rows, tabs }
}
