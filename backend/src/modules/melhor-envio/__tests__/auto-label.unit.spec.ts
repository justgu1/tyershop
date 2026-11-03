import { resolveAutoLabel } from "../auto-label"

describe("compra automática da etiqueta", () => {
  it("a escolha salva no admin vale mais que a variável de ambiente", () => {
    expect(resolveAutoLabel(false, "true")).toBe(false)
    expect(resolveAutoLabel(true, "false")).toBe(true)
  })

  it("sem escolha salva, segue a variável de ambiente e fica desligada por padrão", () => {
    expect(resolveAutoLabel(undefined, "true")).toBe(true)
    expect(resolveAutoLabel(undefined, undefined)).toBe(false)
  })
})
