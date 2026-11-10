import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { BASE_COLUMNS, BASE_TAB, buildBase, TabInfo } from "./aggregate"
import { collectDrops, collectSaleLines } from "./collect"
import { parseServiceAccount, SheetsClient } from "./google"
import { argumentSeparator, baseValues, CONFECCAO_HEADER_ROW, DAILY_HEADER_ROW, DAILY_NET_COL, DAILY_TOTAL_COL, dailyColumns, localizeFormulas, ORDER_LIST_COLUMNS, orderListHeaderRow, renderConfeccao, renderTab, SUMMARY_FIRST_ROW, SUMMARY_ROWS, tabConfeccao } from "./render"

type Sheet = { sheetId: number; title: string; chartIds: number[] }

const color = (r: number, g: number, b: number) => ({ red: r, green: g, blue: b })
const PRESALE = color(0.55, 0.36, 0.96)
const GENERAL = color(0.15, 0.55, 0.85)
const STARTER = color(0.95, 0.6, 0.1)
const BRACELET = color(0.2, 0.65, 0.4)
const TOTAL = color(0.1, 0.1, 0.1)

const MONEY = { numberFormat: { type: "CURRENCY", pattern: "R$ #,##0.00" } }
const DATE = { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } }
const DATETIME = { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm:ss" } }
const BOLD = { textFormat: { bold: true } }

const cells = (sheetId: number, r0: number, r1: number, c0: number, c1: number, userEnteredFormat: object, field: string) => ({
  repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat }, fields: `userEnteredFormat.${field}` },
})

function chartRequest(sheetId: number, title: string, type: "LINE" | "COLUMN", firstRow: number, lastRow: number, series: { col: number; color: object }[], anchorCol: number, stacked = false) {
  const range = (col: number) => ({ sources: [{ sheetId, startRowIndex: firstRow, endRowIndex: lastRow, startColumnIndex: col, endColumnIndex: col + 1 }] })
  return {
    addChart: {
      chart: {
        spec: {
          title,
          basicChart: {
            chartType: type,
            legendPosition: "BOTTOM_LEGEND",
            ...(stacked ? { stackedType: "STACKED" } : {}),
            axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS", title: "R$" }],
            domains: [{ domain: { sourceRange: range(0) } }],
            series: series.map((s) => ({ series: { sourceRange: range(s.col) }, targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: s.color } })),
            headerCount: 0,
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 1, columnIndex: anchorCol }, widthPixels: 560, heightPixels: 300 } },
      },
    },
  }
}

export function chartRequests(tab: TabInfo, sheetId: number) {
  if (!tab.days.length) return []
  const first = DAILY_HEADER_ROW - 1
  const last = DAILY_HEADER_ROW + tab.days.length
  return [
    chartRequest(sheetId, "Acumulado líquido do drop", "LINE", first, last, [{ col: DAILY_TOTAL_COL, color: TOTAL }], 16),
    chartRequest(sheetId, "Venda diária (bruto) por origem", "COLUMN", first, last, [{ col: 2, color: PRESALE }, { col: 5, color: GENERAL }, { col: 8, color: STARTER }, { col: 11, color: BRACELET }], 25, true),
  ]
}

const DAILY_MONEY_COLS = [2, 3, 5, 6, 8, 9, 11, 12, DAILY_NET_COL, DAILY_TOTAL_COL]

function tabFormat(tab: TabInfo, sheetId: number) {
  const dayEnd = DAILY_HEADER_ROW + Math.max(tab.days.length, 1)
  const listHeader = orderListHeaderRow(tab)
  const summaryEnd = 4 + SUMMARY_ROWS
  return [
    cells(sheetId, 0, 1, 0, 1, { textFormat: { bold: true, fontSize: 14 } }, "textFormat"),
    cells(sheetId, SUMMARY_FIRST_ROW - 2, SUMMARY_FIRST_ROW - 1, 0, 7, BOLD, "textFormat"),
    cells(sheetId, summaryEnd - 1, summaryEnd, 0, 7, BOLD, "textFormat"),
    cells(sheetId, SUMMARY_FIRST_ROW - 1, summaryEnd, 3, 7, MONEY, "numberFormat"),
    cells(sheetId, DAILY_HEADER_ROW - 1, DAILY_HEADER_ROW, 0, dailyColumns().length, BOLD, "textFormat"),
    cells(sheetId, DAILY_HEADER_ROW, dayEnd, 0, 1, DATE, "numberFormat"),
    ...DAILY_MONEY_COLS.map((c) => cells(sheetId, DAILY_HEADER_ROW, dayEnd, c, c + 1, MONEY, "numberFormat")),
    cells(sheetId, listHeader - 2, listHeader - 1, 0, 1, { textFormat: { bold: true, fontSize: 12 } }, "textFormat"),
    cells(sheetId, listHeader - 1, listHeader, 0, ORDER_LIST_COLUMNS.length, BOLD, "textFormat"),
    cells(sheetId, listHeader, listHeader + Math.max(tab.lines, 1), 1, 2, DATETIME, "numberFormat"),
    cells(sheetId, listHeader, listHeader + Math.max(tab.lines, 1), 7, 8, MONEY, "numberFormat"),
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: dailyColumns().length } } },
  ]
}

function confeccaoFormat(tab: TabInfo, sheetId: number) {
  const width = 4 + tab.sizes.length
  const end = CONFECCAO_HEADER_ROW + tab.grade.length + 1
  return [
    cells(sheetId, 0, 1, 0, 1, { textFormat: { bold: true, fontSize: 14 } }, "textFormat"),
    cells(sheetId, CONFECCAO_HEADER_ROW - 1, CONFECCAO_HEADER_ROW, 0, width, BOLD, "textFormat"),
    cells(sheetId, CONFECCAO_HEADER_ROW - 1, CONFECCAO_HEADER_ROW, 0, width, { backgroundColor: color(0.9, 0.9, 0.9) }, "backgroundColor"),
    cells(sheetId, CONFECCAO_HEADER_ROW, end, 3, width, { horizontalAlignment: "CENTER" }, "horizontalAlignment"),
    ...(tab.grade.length ? [cells(sheetId, end - 1, end, 0, width, BOLD, "textFormat")] : []),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: CONFECCAO_HEADER_ROW } }, fields: "gridProperties.frozenRowCount" } },
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: width } } },
  ]
}

function baseFormat(sheetId: number, rowCount: number) {
  const end = Math.max(rowCount, 2)
  return [
    cells(sheetId, 0, 1, 0, BASE_COLUMNS.length, BOLD, "textFormat"),
    cells(sheetId, 1, end, 1, 2, DATETIME, "numberFormat"),
    cells(sheetId, 1, end, 2, 3, DATE, "numberFormat"),
    cells(sheetId, 1, end, 7, 9, MONEY, "numberFormat"),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: BASE_COLUMNS.length } } },
  ]
}

export function sheetsFromEnv(env: NodeJS.ProcessEnv = process.env): SheetsClient | null {
  const id = env.GOOGLE_SHEETS_SPREADSHEET_ID
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!id || !raw) return null
  return new SheetsClient(parseServiceAccount(raw), id)
}

/**
 * Recalcula tudo do banco: reescreve a Base de dados e as abas de fórmulas. Idempotente, então evento perdido
 * se corrige na rodada seguinte. A base vai primeiro para as fórmulas nunca lerem dados velhos.
 */
export async function syncSalesSheet(scope: MedusaContainer, client: SheetsClient | null = sheetsFromEnv()): Promise<{ tabs: string[]; rows: number } | null> {
  if (!client) return null
  const { drops, dropOfProduct } = await collectDrops(scope)
  const { rows, tabs } = buildBase(await collectSaleLines(scope, dropOfProduct), drops)
  const updatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date())

  const sep = argumentSeparator(await client.getLocale())
  const existing = new Map<string, Sheet>(
    (await client.getSheets()).sheets.map((s) => [s.properties.title, { sheetId: s.properties.sheetId, title: s.properties.title, chartIds: (s.charts ?? []).map((c) => c.chartId) }])
  )
  const wanted = [BASE_TAB, ...tabs.flatMap((t) => [t.name, tabConfeccao(t.name)])].filter((name) => !existing.has(name))
  if (wanted.length) {
    const res = await client.batchUpdate(wanted.map((title) => ({ addSheet: { properties: { title } } })))
    res.replies.forEach((rep: any) => existing.set(rep.addSheet.properties.title, { sheetId: rep.addSheet.properties.sheetId, title: rep.addSheet.properties.title, chartIds: [] }))
  }

  const base = existing.get(BASE_TAB)!
  await client.clear(`'${BASE_TAB}'`)
  await client.write(`'${BASE_TAB}'!A1`, baseValues(rows))
  await client.batchUpdate(baseFormat(base.sheetId, rows.length + 1))

  for (const tab of tabs) {
    const sheet = existing.get(tab.name)!
    await client.clear(`'${tab.name}'`)
    await client.write(`'${tab.name}'!A1`, localizeFormulas(renderTab(tab, updatedAt), sep))
    await client.batchUpdate([
      ...sheet.chartIds.map((chartId) => ({ deleteEmbeddedObject: { objectId: chartId } })),
      ...tabFormat(tab, sheet.sheetId),
      ...chartRequests(tab, sheet.sheetId),
    ])

    const confeccao = existing.get(tabConfeccao(tab.name))!
    await client.clear(`'${confeccao.title}'`)
    await client.write(`'${confeccao.title}'!A1`, localizeFormulas(renderConfeccao(tab, updatedAt), sep))
    await client.batchUpdate(confeccaoFormat(tab, confeccao.sheetId))
  }
  return { tabs: tabs.flatMap((t) => [t.name, tabConfeccao(t.name)]), rows: rows.length }
}

/** Uma rodada por vez: a que não consegue o lock cede, porque a em andamento (ou a próxima do job) já cobre o mesmo estado. */
export async function syncWithLock(scope: MedusaContainer) {
  const locking = scope.resolve(Modules.LOCKING) as any
  await locking
    .execute("sales-sheet-sync", () => syncSalesSheet(scope), { timeout: 1 })
    .catch((err: Error) => {
      if (!/timed out|acquire/i.test(err.message)) throw err
    })
}

let timer: NodeJS.Timeout | null = null

/** Junta vendas em rajada (drop abrindo) numa só atualização da planilha. */
export function requestSync(scope: MedusaContainer, delayMs = 20_000) {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID || timer) return
  timer = setTimeout(() => {
    timer = null
    syncWithLock(scope).catch((err) => scope.resolve("logger").error(`[sales-sheet] ${err.message}`))
  }, delayMs)
}
