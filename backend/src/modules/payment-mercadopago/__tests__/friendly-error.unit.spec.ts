import { friendlyMercadoPagoError } from "../client"

describe("friendlyMercadoPagoError", () => {
  it("troca o erro cru do e-mail por uma mensagem em português", () => {
    expect(friendlyMercadoPagoError("Payer email forbidden", 403).message).toMatch(/e-mail/)
    expect(friendlyMercadoPagoError("payer.email must be a valid email", 400).type).toBe("invalid_data")
  })

  it("trata falha do Mercado Pago como indisponibilidade", () => {
    const r = friendlyMercadoPagoError("internal", 503)
    expect(r.type).toBe("unexpected_state")
    expect(r.message).toMatch(/indisponível/)
  })

  it("nunca devolve o texto cru ao cliente", () => {
    expect(friendlyMercadoPagoError("cc_rejected_unknown stack trace", 422).message).not.toMatch(/stack|cc_rejected/)
  })
})
