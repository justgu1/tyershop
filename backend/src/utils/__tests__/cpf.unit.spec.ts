import { isValidCpf } from "../cpf"

describe("CPF", () => {
  it("aceita CPF com dígitos verificadores corretos, com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true)
    expect(isValidCpf("52998224725")).toBe(true)
  })

  it("recusa dígitos verificadores errados, repetidos e tamanho incorreto", () => {
    expect(isValidCpf("52998224799")).toBe(false)
    expect(isValidCpf("11111111111")).toBe(false)
    expect(isValidCpf("123")).toBe(false)
    expect(isValidCpf(null)).toBe(false)
  })
})
