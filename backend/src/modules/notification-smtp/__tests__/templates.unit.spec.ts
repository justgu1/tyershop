import { LOGO_CID, renderTemplate } from "../templates"

const data = {
  email: "cliente@x.com",
  name: "Maria",
  drop_title: "Red Rose",
  login_url: "https://tyer.test/drop/entrar?c=abc123",
  presale_ends_at: "2026-11-05T15:00:00Z",
  production_days: 21,
}

describe("ticket email", () => {
  const mail = renderTemplate("ticket", data)

  it("sends the buyer straight into the account through the button", () => {
    expect(mail.html).toContain('href="https://tyer.test/drop/entrar?c=abc123"')
    expect(mail.text).toContain("https://tyer.test/drop/entrar?c=abc123")
  })

  it("shows the logo inline and a footer with support and reason", () => {
    expect(mail.html).toContain(`cid:${LOGO_CID}`)
    expect(mail.html).toContain("suporte@tyershop.com")
    expect(mail.html).toContain("cliente@x.com")
  })

  it("states the presale rules and production time", () => {
    expect(mail.html).toContain("2 peças de cada produto")
    expect(mail.html).toContain("21 dias")
    expect(mail.subject).toBe("Seu ingresso para o drop Red Rose")
  })

  it("escapes user-provided values", () => {
    const evil = renderTemplate("ticket", { ...data, name: '<img src=x onerror="alert(1)">' })
    expect(evil.html).not.toContain("<img src=x")
    expect(evil.html).toContain("&lt;img src=x")
  })

  it("rejects unknown templates", () => {
    expect(() => renderTemplate("nope", {})).toThrow(/desconhecido/)
  })
})
