import { findInCart, getLabel } from "../client"

const respond = (status: number, body: unknown) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

describe("getLabel", () => {
  afterEach(() => jest.restoreAllMocks())

  it("devolve a situação que o rastreio informa, inclusive pending", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => respond(200, { "ME-1": { status: "pending", tracking: null } }))
    await expect(getLabel("token", "ME-1")).resolves.toMatchObject({ status: "pending" })
  })

  it("sem entrada para a etiqueta é erro, para quem chama não pagar às cegas", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => respond(200, {}))
    await expect(getLabel("token", "ME-1")).rejects.toThrow(/situação da etiqueta/)
  })
})

describe("findInCart", () => {
  afterEach(() => jest.restoreAllMocks())

  it("acha o envio do pedido pela etiqueta, em qualquer página do carrinho", async () => {
    jest.spyOn(global, "fetch").mockImplementation((url) =>
      String(url).includes("page=2")
        ? respond(200, { data: [{ id: "ME-9", status: "pending", tags: [{ tag: "Pedido #9" }] }], last_page: 2 })
        : respond(200, { data: [{ id: "ME-1", tags: [{ tag: "Pedido #1" }] }], last_page: 2 })
    )
    await expect(findInCart("token", "Pedido #9")).resolves.toBe("ME-9")
  })

  it("falha de consulta é erro: não se cria outro envio às cegas", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => respond(503, {}))
    await expect(findInCart("token", "Pedido #9")).rejects.toThrow()
  })

  it("carrinho grande demais para conferir é erro, não ausência", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => respond(200, { data: [], last_page: 99 }))
    await expect(findInCart("token", "Pedido #9")).rejects.toThrow(/grande demais/)
  })
})
