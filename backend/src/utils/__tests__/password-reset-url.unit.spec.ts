import { passwordResetUrl } from "../password-reset-url"

const env = { SITE_URL: "https://tyershop.com/", ADMIN_CORS: "https://medusa.tyershop.com" }

describe("passwordResetUrl", () => {
  it("cliente recebe o link da loja", () => {
    expect(passwordResetUrl("customer", "a b", "c@x.com", env)).toBe("https://tyershop.com/account/reset-password?token=a%20b")
  })

  it("usuário do admin recebe o link do admin do Medusa com o e-mail", () => {
    expect(passwordResetUrl("user", "tok", "szguisantos@gmail.com", env)).toBe(
      "https://medusa.tyershop.com/app/reset-password?token=tok&email=szguisantos%40gmail.com"
    )
  })

  it("usa a primeira origem de ADMIN_CORS", () => {
    expect(passwordResetUrl("user", "t", "a@b.c", { ADMIN_CORS: "https://a.com, https://b.com" })).toContain("https://a.com/app/")
  })

  it("outro tipo de ator não recebe e-mail", () => {
    expect(passwordResetUrl("driver", "t", "a@b.c", env)).toBeNull()
  })
})
