import { unsubscribeToken, unsubscribeUrl, validUnsubscribeToken } from "../unsubscribe"

describe("descadastro", () => {
  it("o token vale só para o e-mail que o gerou, sem diferenciar maiúsculas", () => {
    const token = unsubscribeToken("Ana@Tyer.test")
    expect(validUnsubscribeToken("ana@tyer.test", token)).toBe(true)
    expect(validUnsubscribeToken("outra@tyer.test", token)).toBe(false)
  })

  it("recusa token vazio ou de tamanho errado", () => {
    expect(validUnsubscribeToken("ana@tyer.test", "")).toBe(false)
    expect(validUnsubscribeToken("ana@tyer.test", "abc")).toBe(false)
  })

  it("monta o link para a página do site", () => {
    expect(unsubscribeUrl("ana@tyer.test")).toMatch(/\/sair-da-lista\?e=ana%40tyer\.test&t=[0-9a-f]{32}$/)
  })
})
