import { BASE_COLUMNS, BASE_TAB, BaseRow, PHASE_GENERAL, PHASE_PRESALE, PHASE_STARTER, STATUS_ACTIVE, STATUS_CANCELED, TabInfo } from "./aggregate"

export const DAILY_HEADER_ROW = 10
const FIRST_DAILY = DAILY_HEADER_ROW + 1
const col = (letter: string) => `'${BASE_TAB}'!$${letter}$2:$${letter}`

export function baseValues(rows: BaseRow[]): (string | number)[][] {
  return [[...BASE_COLUMNS], ...rows]
}

type Filter = { tab: string; phase: string | null; status: string; day?: string }

const conditions = ({ tab, phase, status, day }: Filter) =>
  [`${col("D")},"${tab}"`, phase ? `${col("E")},"${phase}"` : "", `${col("J")},"${status}"`, day ? `${col("C")},${day}` : ""].filter(Boolean).join(",")

const sumifs = (sumCol: string, f: Filter) => `SUMIFS(${col(sumCol)},${conditions(f)})`

/** Pedidos distintos: a base tem uma linha por item, então um pedido com vários itens aparece mais de uma vez. */
const orders = (f: Omit<Filter, "status">) => {
  const checks = [`${col("D")}="${f.tab}"`, f.phase ? `${col("E")}="${f.phase}"` : "", `${col("J")}="${STATUS_ACTIVE}"`, f.day ? `${col("C")}=${f.day}` : ""].filter(Boolean)
  return `=IFERROR(COUNTUNIQUE(FILTER(${col("A")},${checks.join(",")})),0)`
}

export const dailyColumns = (split: boolean) =>
  split
    ? ["Dia", "Pré-venda: pedidos", "Pré-venda: bruto", "Pré-venda: líquido", "Venda global: pedidos", "Venda global: bruto", "Venda global: líquido", "Acumulado pré-venda", "Acumulado venda global", "Acumulado total"]
    : ["Dia", "Pedidos", "Bruto", "Líquido", "Acumulado"]

/** Toda célula numérica da aba é fórmula sobre a Base de dados: corrigir ou filtrar a base reflete aqui sem passar pelo backend. */
export function renderTab(tab: TabInfo, updatedAt: string): (string | number)[][] {
  const phases = tab.split ? [PHASE_PRESALE, PHASE_GENERAL] : [PHASE_STARTER]
  const rows: (string | number)[][] = [
    [`Vendas — ${tab.name}`],
    [`Base de dados atualizada em ${updatedAt}. Valores em R$; líquido = bruto − reembolsos; cancelados não entram em peças, bruto nem líquido.`],
    [],
    ["", "Pedidos", "Peças", "Bruto", "Reembolsado", "Cancelado", "Líquido"],
  ]
  phases.forEach((phase, i) => {
    const r = 5 + i
    const f = (status: string): Filter => ({ tab: tab.name, phase, status })
    rows.push([
      phase,
      orders({ tab: tab.name, phase }),
      `=${sumifs("G", f(STATUS_ACTIVE))}`,
      `=${sumifs("H", f(STATUS_ACTIVE))}`,
      `=${sumifs("I", f(STATUS_ACTIVE))}`,
      `=${sumifs("H", f(STATUS_CANCELED))}`,
      `=D${r}-E${r}`,
    ])
  })
  if (tab.split) rows.push(["Total", ...["B", "C", "D", "E", "F", "G"].map((c) => `=SUM(${c}5:${c}6)`)])
  while (rows.length < DAILY_HEADER_ROW - 1) rows.push([])
  rows.push(dailyColumns(tab.split))

  tab.days.forEach((day, i) => {
    const r = FIRST_DAILY + i
    const d = `$A${r}`
    const gross = (phase: string | null) => `=${sumifs("H", { tab: tab.name, phase, status: STATUS_ACTIVE, day: d })}`
    const net = (phase: string | null) => `=${sumifs("H", { tab: tab.name, phase, status: STATUS_ACTIVE, day: d })}-${sumifs("I", { tab: tab.name, phase, status: STATUS_ACTIVE, day: d })}`
    if (tab.split) {
      rows.push([
        day,
        orders({ tab: tab.name, phase: PHASE_PRESALE, day: d }),
        gross(PHASE_PRESALE),
        net(PHASE_PRESALE),
        orders({ tab: tab.name, phase: PHASE_GENERAL, day: d }),
        gross(PHASE_GENERAL),
        net(PHASE_GENERAL),
        `=SUM(D$${FIRST_DAILY}:D${r})`,
        `=SUM(G$${FIRST_DAILY}:G${r})`,
        `=H${r}+I${r}`,
      ])
    } else {
      rows.push([day, orders({ tab: tab.name, phase: null, day: d }), gross(null), net(null), `=SUM(D$${FIRST_DAILY}:D${r})`])
    }
  })
  return rows
}
