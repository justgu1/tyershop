import { methodLabel } from "../payment-method"

describe("methodLabel", () => {
  it("nomeia Pix, cartão e boleto", () => {
    expect(methodLabel("pix")).toBe("Pix")
    expect(methodLabel("card")).toBe("Cartão de crédito")
    expect(methodLabel("boleto")).toBe("Boleto")
  })

  it("método desconhecido ou ausente cai no texto de reserva", () => {
    expect(methodLabel("outro", "Mercado Pago")).toBe("Mercado Pago")
    expect(methodLabel(null)).toBe("—")
  })
})
