import { statusOnCapture } from "../status"

describe("statusOnCapture", () => {
  it("libera quem se cadastra durante o cronômetro", () => {
    expect(statusOnCapture(null, "coming_soon")).toBe("liberado")
  })

  it("deixa pendente fora da fase do cronômetro ou sem drop", () => {
    expect(statusOnCapture(null, "presale")).toBe("pendente")
    expect(statusOnCapture(null, "ended")).toBe("pendente")
    expect(statusOnCapture(null, null)).toBe("pendente")
  })

  it("libera um pendente que volta a se cadastrar durante o cronômetro", () => {
    expect(statusOnCapture("pendente", "coming_soon")).toBe("liberado")
  })

  it("não muda liberado, inativo nem negado", () => {
    expect(statusOnCapture("negado", "coming_soon")).toBe("negado")
    expect(statusOnCapture("inativo", "coming_soon")).toBe("inativo")
    expect(statusOnCapture("liberado", "presale")).toBe("liberado")
  })
})
