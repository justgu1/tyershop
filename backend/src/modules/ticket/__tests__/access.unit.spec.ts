import { isTrustedIdentity } from "../access"

describe("isTrustedIdentity", () => {
  it("confia em login criado por nós para um lead", () => {
    expect(isTrustedIdentity({ lead_account: true, customer_id: "cus_1" })).toBe(true)
  })

  it("confia em login de usuário do admin", () => {
    expect(isTrustedIdentity({ user_id: "user_1" })).toBe(true)
  })

  it("não confia em login criado por cadastro público (possível pré-registro com e-mail alheio)", () => {
    expect(isTrustedIdentity({ customer_id: "cus_1" })).toBe(false)
    expect(isTrustedIdentity({})).toBe(false)
    expect(isTrustedIdentity(null)).toBe(false)
  })
})
