import { isUndeliverable, readTestMode, resolveRecipient } from "../test-mode"

describe("readTestMode", () => {
  it("is on by default", () => {
    expect(readTestMode({}).enabled).toBe(true)
  })

  it.each(["false", "0", "OFF", " no "])("is off for %p", (v) => {
    expect(readTestMode({ EMAIL_TEST_MODE: v }).enabled).toBe(false)
  })

  it("stays on for any other value", () => {
    expect(readTestMode({ EMAIL_TEST_MODE: "true" }).enabled).toBe(true)
    expect(readTestMode({ EMAIL_TEST_MODE: "banana" }).enabled).toBe(true)
  })

  it("reads the test address", () => {
    expect(readTestMode({ EMAIL_TEST_TO: " eu@teste.com " }).to).toBe("eu@teste.com")
    expect(readTestMode({ EMAIL_TEST_TO: "  " }).to).toBeUndefined()
  })
})

describe("resolveRecipient", () => {
  it("redirects to the test address, keeps the subject clean and reports the original", () => {
    const r = resolveRecipient("cliente@x.com", "Seu ingresso", { enabled: true, to: "eu@teste.com" })
    expect(r.to).toBe("eu@teste.com")
    expect(r.subject).toBe("Seu ingresso")
    expect(r.redirectedFrom).toBe("cliente@x.com")
  })

  it("refuses to send when test mode is on without a test address", () => {
    expect(() => resolveRecipient("cliente@x.com", "x", { enabled: true })).toThrow(/EMAIL_TEST_TO/)
  })

  it("sends to the customer when test mode is off", () => {
    expect(resolveRecipient("cliente@x.com", "Seu ingresso", { enabled: false })).toEqual({
      to: "cliente@x.com",
      subject: "Seu ingresso",
    })
  })
})

describe("isUndeliverable", () => {
  it("reconhece o domínio reservado .invalid", () => {
    expect(isUndeliverable("cliente@clientes-teste.invalid")).toBe(true)
    expect(isUndeliverable(" Cliente@Teste.INVALID ")).toBe(true)
    expect(isUndeliverable("cliente@gmail.com")).toBe(false)
  })
})
