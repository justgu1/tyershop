import { MercadoPagoClient } from "../client"

describe("corpo enviado ao Mercado Pago", () => {
  const client = new MercadoPagoClient({ accessToken: "t" })
  const additionalInfo = { items: [{ id: "p", title: "Regata", description: "Regata - G", category_id: "fashion", quantity: 1, unit_price: 10 }] }
  let sent: any
  let sentHeaders: Record<string, string>

  beforeEach(() => {
    sent = undefined
    ;(global as any).fetch = jest.fn(async (_url: string, init: any) => {
      sent = JSON.parse(init.body)
      sentHeaders = init.headers
      return { ok: true, json: async () => ({ id: 1, status: "pending" }) }
    })
  })

  it("o Pix leva additional_info com os itens, como o cartão", async () => {
    await client.createPixPayment({
      idempotencyKey: "k", transactionAmount: 10, description: "d", externalReference: "s",
      payer: { email: "a@b.com" }, additionalInfo,
    })
    expect(sent.additional_info.items[0]).toMatchObject({ id: "p", description: "Regata - G", category_id: "fashion" })
  })

  it("o Pix leva o Device ID no cabeçalho, como o cartão", async () => {
    await client.createPixPayment({
      idempotencyKey: "k", transactionAmount: 10, description: "d", externalReference: "s",
      payer: { email: "a@b.com" }, deviceId: "dev-123",
    })
    expect(sentHeaders["X-meli-session-id"]).toBe("dev-123")
  })

  it("o cartão leva nome e sobrenome do pagador, emissor e nome na fatura", async () => {
    await client.createCardPayment({
      idempotencyKey: "k", transactionAmount: 10, description: "d", token: "tok", installments: 1, externalReference: "s",
      issuerId: "24", payer: { email: "a@b.com", firstName: "Ana", lastName: "Silva" }, additionalInfo,
    })
    expect(sent.issuer_id).toBe("24")
    expect(sent.payer).toMatchObject({ email: "a@b.com", first_name: "Ana", last_name: "Silva" })
    expect(sent.statement_descriptor).toBe("TYERSHOP")
    expect(sent.additional_info.items[0].category_id).toBe("fashion")
  })
})
