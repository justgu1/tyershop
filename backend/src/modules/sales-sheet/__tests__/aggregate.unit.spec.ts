import { BASE_COLUMNS, buildBase, dropNumber, DropInfo, SaleLine, sheetSerial, splitVariant } from "../aggregate"
import { allocateRefund } from "../collect"
import { argumentSeparator, baseValues, DAILY_HEADER_ROW, localizeFormulas, orderListHeaderRow, renderConfeccao, renderTab } from "../render"

const drop6: DropInfo = { id: "d6", handle: "drop-6", title: "Drop 6", startsAt: new Date("2026-11-04T15:00:00Z"), salesStart: new Date("2026-11-06T15:00:00Z") }
const teste: DropInfo = { id: "dt", handle: "drop-teste", title: "Teste", startsAt: new Date("2026-11-01T03:00:00Z"), salesStart: new Date("2026-11-03T03:00:00Z") }
const line = (o: Partial<SaleLine>): SaleLine => ({
  orderId: "order_1",
  displayId: 1,
  createdAt: new Date("2026-11-05T12:00:00Z"),
  canceled: false,
  title: "Camiseta",
  variantTitle: "Branca / M",
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

  it("só há aba para drop 6 em diante; drop-teste fica fora da base", () => {
    const { rows, tabs } = buildBase([line({}), line({ displayId: 3, dropId: "dt" })], [drop6, teste])
    expect(tabs.map((t) => t.name)).toEqual(["Drop 6"])
    expect(rows).toHaveLength(1)
  })

  it("Starter e pulseira vendidas na janela do drop entram nele, sem aba própria", () => {
    const { rows, tabs } = buildBase(
      [
        line({ dropId: null, title: "Regata Savage Mode", createdAt: new Date("2026-11-07T12:00:00Z") }),
        line({ displayId: 2, dropId: null, title: "Pulseira Tyer", variantTitle: "Preta", createdAt: new Date("2026-11-07T13:00:00Z") }),
      ],
      [drop6]
    )
    expect(tabs.map((t) => t.name)).toEqual(["Drop 6"])
    expect(rows.map((r) => [r[3], r[4], r[11]])).toEqual([["Drop 6", "Venda", "Starter"], ["Drop 6", "Venda", "Pulseira"]])
  })

  it("Starter vendido antes do primeiro drop da planilha fica de fora; depois de um drop novo, vai para ele", () => {
    const drop7: DropInfo = { id: "d7", handle: "drop-7", title: "Drop 7", startsAt: new Date("2026-12-01T15:00:00Z"), salesStart: new Date("2026-12-05T15:00:00Z") }
    const { rows } = buildBase(
      [
        line({ dropId: null, createdAt: new Date("2026-10-20T12:00:00Z") }),
        line({ displayId: 2, dropId: null, createdAt: new Date("2026-11-20T12:00:00Z") }),
        line({ displayId: 3, dropId: null, createdAt: new Date("2026-12-02T12:00:00Z") }),
      ],
      [drop6, drop7]
    )
    expect(rows.map((r) => [r[0], r[3]])).toEqual([[2, "Drop 6"], [3, "Drop 7"]])
  })

  it("lista os dias de cada aba em ordem, sem repetir", () => {
    const { tabs } = buildBase([line({ createdAt: new Date("2026-11-06T16:00:00Z") }), line({}), line({ displayId: 2 })], [drop6])
    expect(tabs[0].days).toHaveLength(2)
    expect(tabs[0].days[0]).toBeLessThan(tabs[0].days[1])
  })

  it("a base só tem as colunas permitidas, sem dado de cliente", () => {
    expect(BASE_COLUMNS).toEqual(["Pedido", "Data e hora", "Dia", "Aba", "Fase", "Produto", "Quantidade", "Bruto", "Reembolsado", "Status", "Variação", "Linha", "Cor", "Tamanho"])
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
  const rows = renderTab(tabs[0], "agora")

  it("todo número do resumo e do detalhe é fórmula sobre a Base de dados", () => {
    const formulas = rows.flat().filter((c) => typeof c === "string" && c.startsWith("="))
    expect(formulas.length).toBeGreaterThan(20)
    expect(formulas.filter((f) => /SUMIFS|ROWS\(UNIQUE/.test(f as string)).every((f) => (f as string).includes("'Base de dados'!"))).toBe(true)
  })

  it("o detalhe diário traz o dia como valor e acumula o líquido total", () => {
    const first = rows[DAILY_HEADER_ROW]
    expect(first[0]).toBe(tabs[0].days[0])
    expect(first[13]).toBe("=D12+G12+J12+M12")
    expect(first[14]).toBe("=SUM(N$12:N12)")
  })

  it("o resumo traz pré-venda, venda global, Starter e pulseira", () => {
    expect(rows.slice(4, 8).map((r) => r[0])).toEqual(["Pré-venda", "Venda global", "Starter", "Pulseira"])
  })
})

describe("separador de fórmula por idioma da planilha", () => {
  it("pt_BR usa ponto e vírgula, en_US usa vírgula", () => {
    expect(argumentSeparator("pt_BR")).toBe(";")
    expect(argumentSeparator("en_US")).toBe(",")
  })

  it("em pt_BR nenhuma fórmula sai com vírgula e o texto comum fica intacto", () => {
    const { tabs } = buildBase([line({})], [drop6])
    const rows = localizeFormulas(renderTab(tabs[0], "agora, 10:00"), ";")
    expect(rows.flat().filter((c) => typeof c === "string" && c.startsWith("=")).some((f) => (f as string).includes(","))).toBe(false)
    expect(rows[1][0]).toContain("agora, 10:00")
    expect(rows.flat().some((c) => typeof c === "string" && c.includes("SUMIFS('Base de dados'!$H$2:$H;"))).toBe(true)
  })
})

describe("contagem de pedidos", () => {
  it("não usa COUNTUNIQUE, que conta o erro do FILTER vazio como 1 pedido", () => {
    const { tabs } = buildBase([line({})], [drop6])
    expect(JSON.stringify(renderTab(tabs[0], "agora"))).not.toContain("COUNTUNIQUE")
  })
})

describe("lista de pedidos da aba", () => {
  const { rows, tabs } = buildBase([line({}), line({ displayId: 2, variantTitle: "G" })], [drop6])
  const out = renderTab(tabs[0], "agora")

  it("a base guarda a variação (cor e tamanho) de cada item", () => {
    expect(rows.map((r) => r[10])).toEqual(["Branca / M", "G"])
  })

  it("cada aba lista pedido, peça e variação por fórmula sobre a base, sem chaves de array", () => {
    const formula = out.flat().find((c) => typeof c === "string" && c.includes("CHOOSECOLS")) as string
    expect(formula).toContain("FILTER('Base de dados'!$A$2:$N")
    expect(formula).toContain('"Drop 6"')
    expect(formula).not.toMatch(/[{}]/)
    expect(out.flat()).toEqual(expect.arrayContaining(["Pedido", "Linha", "Peça", "Variação (cor / tamanho)"]))
  })

  it("o cabeçalho da lista fica na linha que a formatação espera", () => {
    expect(out[orderListHeaderRow(tabs[0]) - 1][0]).toBe("Pedido")
  })
})

describe("splitVariant", () => {
  it("separa cor e tamanho nas formas que o catálogo usa", () => {
    expect(splitVariant("Branca / M")).toEqual({ color: "Branca", size: "M" })
    expect(splitVariant("gg")).toEqual({ color: "Única", size: "GG" })
    expect(splitVariant("Preta")).toEqual({ color: "Preta", size: "Único" })
  })
})

describe("aba de confecção", () => {
  const { tabs } = buildBase(
    [
      line({ title: "Camiseta Drop", variantTitle: "Branca / M", quantity: 2 }),
      line({ displayId: 2, title: "Camiseta Drop", variantTitle: "Branca / G" }),
      line({ displayId: 3, dropId: null, title: "Regata Savage Mode", variantTitle: "Preta / P", createdAt: new Date("2026-11-07T12:00:00Z") }),
      line({ displayId: 4, dropId: null, title: "Pulseira Tyer", variantTitle: "Preta", createdAt: new Date("2026-11-07T12:00:00Z") }),
      line({ displayId: 5, title: "Camiseta Cancelada", variantTitle: "Verde / M", canceled: true }),
    ],
    [drop6]
  )
  const out = renderConfeccao(tabs[0], "agora")

  it("lista drop, Starter e pulseira nessa ordem, com a grade de tamanhos e sem peça cancelada", () => {
    expect(out[3]).toEqual(["Linha", "Peça", "Cor", "P", "M", "G", "Único", "Total"])
    expect(out.slice(4, 8).map((r) => [r[0], r[1], r[2]])).toEqual([
      ["Drop", "Camiseta Drop", "Branca"],
      ["Starter", "Regata Savage Mode", "Preta"],
      ["Pulseira", "Pulseira Tyer", "Preta"],
      ["Total", "", ""],
    ])
  })

  it("não leva valor em reais nem dado de cliente, e a quantidade é fórmula sobre a base", () => {
    const text = JSON.stringify(out)
    expect(text).not.toMatch(/Bruto|R\$ |Reembols/)
    expect(String(out[4][4])).toContain("SUMIFS('Base de dados'!$G$2:$G")
  })
})
