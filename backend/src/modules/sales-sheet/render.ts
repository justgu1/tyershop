import { BASE_COLUMNS, BASE_TAB, BaseRow, LINE_BRACELET, LINE_STARTER, PHASE_GENERAL, PHASE_PRESALE, STATUS_ACTIVE, STATUS_CANCELED, TabInfo } from "./aggregate"

export const DAILY_HEADER_ROW = 11
const FIRST_DAILY = DAILY_HEADER_ROW + 1
const col = (letter: string) => `'${BASE_TAB}'!$${letter}$2:$${letter}`

export function baseValues(rows: BaseRow[]): (string | number)[][] {
  return [[...BASE_COLUMNS], ...rows]
}

/** Recorte de vendas da aba: pré-venda e venda global (peças do drop) e as linhas fixas Starter e pulseira vendidas na janela do drop. */
export type Segment = { label: string; col: "E" | "L"; value: string }
export const SEGMENTS: Segment[] = [
  { label: PHASE_PRESALE, col: "E", value: PHASE_PRESALE },
  { label: PHASE_GENERAL, col: "E", value: PHASE_GENERAL },
  { label: LINE_STARTER, col: "L", value: LINE_STARTER },
  { label: LINE_BRACELET, col: "L", value: LINE_BRACELET },
]

type Filter = { tab: string; seg: Segment; status: string; day?: string }

const conditions = ({ tab, seg, status, day }: Filter) =>
  [`${col("D")},"${tab}"`, `${col(seg.col)},"${seg.value}"`, `${col("J")},"${status}"`, day ? `${col("C")},${day}` : ""].filter(Boolean).join(",")

const sumifs = (sumCol: string, f: Filter) => `SUMIFS(${col(sumCol)},${conditions(f)})`

/** Pedidos distintos: a base tem uma linha por item. Sem linhas, o FILTER dá erro e vira 0; COUNTUNIQUE contaria esse erro como 1. */
const orders = (f: Omit<Filter, "status">) => {
  const checks = [`${col("D")}="${f.tab}"`, `${col(f.seg.col)}="${f.seg.value}"`, `${col("J")}="${STATUS_ACTIVE}"`, f.day ? `${col("C")}=${f.day}` : ""].filter(Boolean)
  return `=IFERROR(ROWS(UNIQUE(FILTER(${col("A")},${checks.join(",")}))),0)`
}

export const ORDER_LIST_COLUMNS = ["Pedido", "Data e hora", "Linha", "Fase", "Peça", "Variação (cor / tamanho)", "Qtd", "Bruto", "Status"]

/** Linha (1 = primeira) do cabeçalho da lista de pedidos: dois espaços depois do último dia do detalhe diário. */
export const orderListHeaderRow = (tab: TabInfo) => DAILY_HEADER_ROW + tab.days.length + 3

/** Sem chaves de array literal, porque o separador de colunas delas também muda com o idioma da planilha. */
const orderList = (tab: string) =>
  `=IFERROR(SORT(CHOOSECOLS(FILTER('${BASE_TAB}'!$A$2:$N,${col("D")}="${tab}"),1,2,12,5,6,11,7,8,10),2,FALSE),"")`

/** Dia e, para cada recorte, pedidos, bruto e líquido; depois o líquido do dia e o acumulado. */
export const dailyColumns = () => [
  "Dia",
  ...SEGMENTS.flatMap((s) => [`${s.label}: pedidos`, `${s.label}: bruto`, `${s.label}: líquido`]),
  "Líquido do dia",
  "Acumulado líquido",
]

export const DAILY_NET_COL = 1 + SEGMENTS.length * 3
export const DAILY_TOTAL_COL = DAILY_NET_COL + 1

const letter = (index: number) => String.fromCharCode(65 + index)

export const tabConfeccao = (tab: string) => `${tab} - Confecção`

/** Toda célula numérica da aba é fórmula sobre a Base de dados: corrigir ou filtrar a base reflete aqui sem passar pelo backend. */
export function argumentSeparator(locale: string): "," | ";" {
  return new Intl.NumberFormat(locale.replace("_", "-")).format(1.5).includes(",") ? ";" : ","
}

/** A planilha lê a fórmula no idioma dela: em pt_BR o separador de argumentos é `;`. Nenhum trecho das fórmulas tem vírgula além dos separadores. */
export function localizeFormulas(rows: (string | number)[][], sep: "," | ";"): (string | number)[][] {
  if (sep === ",") return rows
  return rows.map((row) => row.map((c) => (typeof c === "string" && c.startsWith("=") ? c.replaceAll(",", sep) : c)))
}

export const SUMMARY_FIRST_ROW = 5
export const SUMMARY_ROWS = SEGMENTS.length + 1

export function renderTab(tab: TabInfo, updatedAt: string): (string | number)[][] {
  const rows: (string | number)[][] = [
    [`Vendas — ${tab.name}`],
    [`Base de dados atualizada em ${updatedAt}. Valores em R$; líquido = bruto − reembolsos; cancelados não entram em peças, bruto nem líquido. Starter e pulseira entram no drop em que foram vendidos.`],
    [],
    ["", "Pedidos", "Peças", "Bruto", "Reembolsado", "Cancelado", "Líquido"],
  ]
  const last = SUMMARY_FIRST_ROW + SEGMENTS.length - 1
  SEGMENTS.forEach((seg, i) => {
    const r = SUMMARY_FIRST_ROW + i
    const f = (status: string): Filter => ({ tab: tab.name, seg, status })
    rows.push([
      seg.label,
      orders({ tab: tab.name, seg }),
      `=${sumifs("G", f(STATUS_ACTIVE))}`,
      `=${sumifs("H", f(STATUS_ACTIVE))}`,
      `=${sumifs("I", f(STATUS_ACTIVE))}`,
      `=${sumifs("H", f(STATUS_CANCELED))}`,
      `=D${r}-E${r}`,
    ])
  })
  rows.push(["Total", ...["B", "C", "D", "E", "F", "G"].map((c) => `=SUM(${c}${SUMMARY_FIRST_ROW}:${c}${last})`)])
  while (rows.length < DAILY_HEADER_ROW - 1) rows.push([])
  rows.push(dailyColumns())

  tab.days.forEach((day, i) => {
    const r = FIRST_DAILY + i
    const d = `$A${r}`
    const cells = SEGMENTS.flatMap((seg) => {
      const gross = sumifs("H", { tab: tab.name, seg, status: STATUS_ACTIVE, day: d })
      const refunded = sumifs("I", { tab: tab.name, seg, status: STATUS_ACTIVE, day: d })
      return [orders({ tab: tab.name, seg, day: d }), `=${gross}`, `=${gross}-${refunded}`]
    })
    const netCols = SEGMENTS.map((_, k) => `${letter(3 + 3 * k)}${r}`)
    rows.push([day, ...cells, `=${netCols.join("+")}`, `=SUM(${letter(DAILY_NET_COL)}$${FIRST_DAILY}:${letter(DAILY_NET_COL)}${r})`])
  })

  rows.push([], [`Vendas por pedido — ${tab.name}`], ORDER_LIST_COLUMNS, [orderList(tab.name)])
  return rows
}

export const CONFECCAO_HEADER_ROW = 4

const quote = (v: string) => v.replaceAll('"', '""')

/**
 * Aba para mandar ao fornecedor: só peça, cor e grade de tamanhos, sem valor nem cliente. Cada linha é uma peça e cor
 * que vendeu no drop; a quantidade é fórmula sobre a base, então corrigir a base reflete aqui.
 */
export function renderConfeccao(tab: TabInfo, updatedAt: string): (string | number)[][] {
  const first = CONFECCAO_HEADER_ROW + 1
  const sizeLetters = tab.sizes.map((_, i) => letter(3 + i))
  const totalCol = letter(3 + tab.sizes.length)
  const rows: (string | number)[][] = [
    [`Confecção — ${tab.name}`],
    [`Quantidades de pedidos ativos até ${updatedAt}; cancelados não entram. Starter e pulseira são as vendidas durante o ${tab.name}.`],
    [],
    ["Linha", "Peça", "Cor", ...tab.sizes, "Total"],
  ]
  tab.grade.forEach((g, i) => {
    const r = first + i
    const qty = (size: string) =>
      `=SUMIFS(${col("G")},${col("D")},"${quote(tab.name)}",${col("J")},"${STATUS_ACTIVE}",${col("L")},$A${r},${col("F")},$B${r},${col("M")},$C${r},${col("N")},${size})`
    rows.push([g.line, g.product, g.color, ...sizeLetters.map((_, k) => qty(`${letter(3 + k)}$${CONFECCAO_HEADER_ROW}`)), `=SUM(${letter(3)}${r}:${letter(2 + tab.sizes.length)}${r})`])
  })
  if (tab.grade.length) {
    const end = first + tab.grade.length - 1
    rows.push(["Total", "", "", ...[...sizeLetters, totalCol].map((c) => `=SUM(${c}${first}:${c}${end})`)])
  }
  return rows
}
