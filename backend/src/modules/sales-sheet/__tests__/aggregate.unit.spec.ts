import { BASE_COLUMNS, buildBase, dropNumber, DropInfo, SaleLine, sheetSerial } from "../aggregate"
import { allocateRefund } from "../collect"
import { baseValues, renderTab } from "../render"

const drop6: DropInfo = { id: "d6", handle: "drop-6", title: "Drop 6", salesStart: new Date("2026-11-06T15:00:00Z") }
const teste: DropInfo = { id: "dt", handle: "drop-teste", title: "Teste", salesStart: new Date("2026-11-03T03:00:00Z") }
const line = (o: Partial<SaleLine>): SaleLine => ({
  orderId: "order_1",
  displayId: 1,
  createdAt: new Date("2026-11-05T12:00:00Z"),
  canceled: false,
  title: "Camiseta",
  amount: 100,
  quantity: 1,
  refunded: 0,
  dropId: "d6",
  ...o,
})

describe("buildBase", () => {
  it("separa pré-venda de venda global pelo início da venda geral do drop", () => {
    const { rows } = buildBase([line({}), line({ displayId: 2, createdAt: new Date("2026-11-06T16:00:00Z") })], [drop6])
    expect(rows.map((r) => r[4])).toEqual(["Pré-venda", "Venda global"])
  })

  it("marca cancelado e leva o reembolso da linha", () => {
    const { rows } = buildBase([line({ refunded: 30 }), line({ displayId: 2, canceled: true })], [drop6])
    expect(rows.map((r) => [r[8], r[9]])).toEqual([[30, "Ativo"], [0, "Cancelado"]])
  })

  it("só há aba para drop 6 em diante; o que não é de drop vai para Starter; drop-teste fica fora da base", () => {
    const { rows, tabs } = buildBase([line({ dropId: null }), line({ displayId: 3, dropId: "dt" })], [drop6, teste])
    expect(tabs.map((t) => t.name)).toEqual(["Starter", "Drop 6"])
    expect(rows.map((r) => r[3])).toEqual(["Starter"])
    expect(rows[0][4]).toBe("Venda")
  })

  it("lista os dias de cada aba em ordem, sem repetir", () => {
    const { tabs } = buildBase([line({ createdAt: new Date("2026-11-06T16:00:00Z") }), line({}), line({ displayId: 2 })], [drop6])
    expect(tabs[1].days).toHaveLength(2)
    expect(tabs[1].days[0]).toBeLessThan(tabs[1].days[1])
  })

  it("a base só tem as colunas permitidas, sem dado de cliente", () => {
    expect(BASE_COLUMNS).toEqual(["Pedido", "Data e hora", "Dia", "Aba", "Fase", "Produto", "Quantidade", "Bruto", "Reembolsado", "Status"])
    const { rows } = buildBase([line({})], [drop6])
    expect(rows[0]).toHaveLength(BASE_COLUMNS.length)
    expect(baseValues(rows)[0]).toHaveLength(BASE_COLUMNS.length)
    expect(JSON.stringify(rows[0])).not.toContain("order_1")
  })
})

describe("sheetSerial", () => {
  it("usa o horário de Brasília: 02:30Z ainda é o dia anterior", () => {
    expect(Math.floor(sheetSerial(new Date("2026-11-06T02:30:00Z")))).toBe(Math.floor(sheetSerial(new Date("2026-11-05T15:00:00Z"))))
  })
  it("converte para dias desde 30/12/1899", () => {
    expect(sheetSerial(new Date("2026-01-01T03:00:00Z"))).toBe(46023)
  })
})

describe("dropNumber", () => {
  it("lê drop-N e ignora outros handles", () => {
    expect(dropNumber("drop-12")).toBe(12)
    expect(dropNumber("drop-teste")).toBeNull()
  })
})

describe("allocateRefund", () => {
  it("rateia na proporção e a soma fecha com o reembolso", () => {
    expect(allocateRefund([100, 100, 100], 10).reduce((a, b) => a + b, 0)).toBe(10)
  })
  it("sem reembolso não aloca nada", () => {
    expect(allocateRefund([50, 50], 0)).toEqual([0, 0])
  })
})

describe("renderTab", () => {
  const { tabs } = buildBase([line({}), line({ displayId: 2, createdAt: new Date("2026-11-06T16:00:00Z") })], [drop6])
  const rows = renderTab(tabs[1], "agora")

  it("todo número do resumo e do detalhe é fórmula sobre a Base de dados", () => {
    const formulas = rows.flat().filter((c) => typeof c === "string" && c.startsWith("="))
    expect(formulas.length).toBeGreaterThan(20)
    expect(formulas.filter((f) => /SUMIFS|COUNTUNIQUE/.test(f as string)).every((f) => (f as string).includes("'Base de dados'!"))).toBe(true)
  })

  it("o detalhe diário traz o dia como valor e acumula o líquido por fase", () => {
    const first = rows[10]
    expect(first[0]).toBe(tabs[1].days[0])
    expect(first[7]).toBe("=SUM(D$11:D11)")
    expect(first[9]).toBe("=H11+I11")
  })
})
