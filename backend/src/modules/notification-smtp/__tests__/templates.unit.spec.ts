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

describe("lead_welcome and password_reset templates", () => {
  it("lead_welcome links to the community and names the drop", () => {
    const mail = renderTemplate("lead_welcome", { email: "a@b.co", drop_title: "Red Rose", whatsapp_url: "https://chat.whatsapp.com/x" })
    expect(mail.subject).toBe("Você está na lista do drop Red Rose")
    expect(mail.html).toContain('href="https://chat.whatsapp.com/x"')
  })

  it("password_reset has a clickable link and escapes the url", () => {
    const mail = renderTemplate("password_reset", { email: "a@b.co", reset_url: 'https://x.co/r?t=1&u="2"' })
    expect(mail.html).toContain('href="https://x.co/r?t=1&amp;u=&quot;2&quot;"')
    expect(mail.text).toContain("https://x.co/r?t=1")
    expect(mail.subject).toBe("Redefinição de senha — Tyer")
  })
})
