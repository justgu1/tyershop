export type SaleLine = {
  orderId: string
  displayId: number
  createdAt: Date
  canceled: boolean
  title: string
  /** Cor e tamanho como o produto os nomeia ("Branca / M", "M"). */
  variantTitle: string
  /** Valor da linha em reais, antes de reembolso. */
  amount: number
  quantity: number
  /** Parcela do reembolso do pedido que cabe a esta linha, em reais. */
  refunded: number
  dropId: string | null
}

export type DropInfo = { id: string; handle: string; title: string; startsAt: Date; salesStart: Date }

export const BASE_TAB = "Base de dados"
export const FIRST_DROP_NUMBER = 6
export const PHASE_PRESALE = "Pré-venda"
export const PHASE_GENERAL = "Venda global"
export const PHASE_STARTER = "Venda"
export const LINE_DROP = "Drop"
export const LINE_STARTER = "Starter"
export const LINE_BRACELET = "Pulseira"
export const STATUS_ACTIVE = "Ativo"
export const STATUS_CANCELED = "Cancelado"

/** Única origem das colunas da Base de dados: só pedido, momento, produto e valores. Nada de cliente, contato, endereço ou pagamento. */
export const BASE_COLUMNS = ["Pedido", "Data e hora", "Dia", "Aba", "Fase", "Produto", "Quantidade", "Bruto", "Reembolsado", "Status", "Variação", "Linha", "Cor", "Tamanho"] as const

export type BaseRow = [number, number, number, string, string, string, number, number, number, string, string, string, string, string]

export type GradeRow = { line: string; product: string; color: string }
export type TabInfo = { name: string; days: number[]; lines: number; grade: GradeRow[]; sizes: string[] }

const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG"]
export const SIZE_NONE = "Único"
export const COLOR_NONE = "Única"
const looksLikeSize = (v: string) => SIZE_ORDER.includes(v.toUpperCase()) || /^\d{1,2}$/.test(v)

/** "Branca / M" vira cor e tamanho; "M" só tamanho; "Preta" (peça sem tamanho) só cor. */
export function splitVariant(variantTitle: string): { color: string; size: string } {
  const parts = variantTitle.split("/").map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return { color: parts.slice(0, -1).join(" / "), size: parts[parts.length - 1].toUpperCase() }
  if (parts.length === 1) return looksLikeSize(parts[0]) ? { color: COLOR_NONE, size: parts[0].toUpperCase() } : { color: parts[0], size: SIZE_NONE }
  return { color: COLOR_NONE, size: SIZE_NONE }
}

export function sortSizes(sizes: Iterable<string>): string[] {
  const rank = (s: string) => (s === SIZE_NONE ? 1000 : SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : /^\d+$/.test(s) ? 100 + Number(s) : 500)
  return [...new Set(sizes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

const LINE_RANK: Record<string, number> = { [LINE_DROP]: 0, [LINE_STARTER]: 1, [LINE_BRACELET]: 2 }

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

/** Peça fora de drop é Starter ou pulseira; o produto não guarda a linha, então a pulseira se reconhece pelo nome. */
export const lineOf = (l: SaleLine, inDrop: boolean) => (inDrop ? LINE_DROP : /pulseira/i.test(l.title) ? LINE_BRACELET : LINE_STARTER)

/**
 * Venda dentro da pré-venda é a anterior ao início da venda geral do drop; a partir dali é venda global.
 * Peça de drop vai para o drop do produto. Starter e pulseira não pertencem a drop: vão para o drop mais recente
 * já iniciado na hora da venda, e o que veio antes do primeiro drop da planilha fica de fora, como drop de teste e drops antigos.
 */
export function buildBase(lines: SaleLine[], drops: DropInfo[]): { rows: BaseRow[]; tabs: TabInfo[] } {
  const eligible = drops.filter((d) => (dropNumber(d.handle) ?? 0) >= FIRST_DROP_NUMBER).sort((a, b) => dropNumber(a.handle)! - dropNumber(b.handle)!)
  const byId = new Map(drops.map((d) => [d.id, d]))
  const eligibleIds = new Set(eligible.map((d) => d.id))
  const windowOf = (at: Date) => [...eligible].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()).find((d) => d.startsAt <= at)
  const days = new Map<string, Set<number>>()
  const grade = new Map<string, Map<string, GradeRow>>()
  const sizes = new Map<string, Set<string>>()
  const rows: BaseRow[] = []

  for (const l of [...lines].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const own = l.dropId ? byId.get(l.dropId) : undefined
    if (own && !eligibleIds.has(own.id)) continue
    const drop = own ?? windowOf(l.createdAt)
    if (!drop) continue
    const tab = tabName(drop)
    const line = lineOf(l, !!own)
    const phase = !own ? PHASE_STARTER : l.createdAt < drop.salesStart ? PHASE_PRESALE : PHASE_GENERAL
    const serial = sheetSerial(l.createdAt)
    const day = Math.floor(serial)
    const { color, size } = splitVariant(l.variantTitle)
    days.set(tab, (days.get(tab) ?? new Set()).add(day))
    if (!l.canceled) {
      const key = [line, l.title, color].join("|")
      const tabGrade = grade.get(tab) ?? new Map<string, GradeRow>()
      tabGrade.set(key, { line, product: l.title, color })
      grade.set(tab, tabGrade)
      sizes.set(tab, (sizes.get(tab) ?? new Set()).add(size))
    }
    rows.push([l.displayId, serial, day, tab, phase, l.title, l.quantity, round(l.amount), round(l.refunded), l.canceled ? STATUS_CANCELED : STATUS_ACTIVE, l.variantTitle, line, color, size])
  }

  const tabs: TabInfo[] = eligible.map((d) => {
    const name = tabName(d)
    return {
      name,
      days: [...(days.get(name) ?? [])].sort((a, b) => a - b),
      lines: rows.filter((r) => r[3] === name).length,
      grade: [...(grade.get(name)?.values() ?? [])].sort((a, b) => LINE_RANK[a.line] - LINE_RANK[b.line] || a.product.localeCompare(b.product) || a.color.localeCompare(b.color)),
      sizes: sortSizes(sizes.get(name) ?? []),
    }
  })
  return { rows, tabs }
}
