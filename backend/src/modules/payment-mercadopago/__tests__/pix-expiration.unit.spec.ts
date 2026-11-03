import { pixExpiration, pixMinutes } from "../pix-expiration"

describe("pixExpiration", () => {
  it("devolve o horário de Brasília (-03:00) daqui a N minutos", () => {
    expect(pixExpiration(new Date("2026-11-03T15:00:00Z"), 30)).toBe("2026-11-03T12:30:00.000-03:00")
  })

  it("atravessa a meia-noite sem errar o dia", () => {
    expect(pixExpiration(new Date("2026-11-03T02:20:00Z"), 30)).toBe("2026-11-02T23:50:00.000-03:00")
    expect(pixExpiration(new Date("2026-11-03T02:50:00Z"), 30)).toBe("2026-11-03T00:20:00.000-03:00")
  })
})

describe("pixMinutes", () => {
  it("usa 30 minutos por padrão e ignora valor inválido ou fora de 5 a 1440", () => {
    expect(pixMinutes({})).toBe(30)
    expect(pixMinutes({ PIX_EXPIRATION_MINUTES: "abc" })).toBe(30)
    expect(pixMinutes({ PIX_EXPIRATION_MINUTES: "1" })).toBe(30)
    expect(pixMinutes({ PIX_EXPIRATION_MINUTES: "15" })).toBe(15)
  })
})
