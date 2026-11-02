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

describe("e-mails de pedido", () => {
  const base = { email: "ana@tyer.test", name: "Ana", display_id: 42, orders_url: "https://tyer.test/account/orders" }

  it("confirmação lista itens, total e prazo de produção", () => {
    const mail = renderTemplate("order_confirmation", {
      ...base,
      currency_code: "brl",
      total: 139.8,
      shipping_total: 19.9,
      items: [{ title: "Camiseta <b>Red Rose</b>", variant: "M", quantity: 2, unit_price: 60 }],
      address: "Rua A, 10, São Paulo/SP, 01000-000",
      production_days: 21,
    })
    expect(mail.subject).toBe("Pedido #42 confirmado")
    expect(mail.html).toContain("Camiseta &lt;b&gt;Red Rose&lt;/b&gt;")
    expect(mail.html).toContain("21 dias")
    expect(mail.text).toContain("2x Camiseta <b>Red Rose</b> (M)")
    expect(mail.text).toContain("Total: R$")
    expect(mail.html).toContain("https://tyer.test/account/orders")
  })

  it("confirmação sem drop avisa do rastreio, sem prazo de produção", () => {
    const mail = renderTemplate("order_confirmation", { ...base, total: 10, shipping_total: 0, items: [] })
    expect(mail.html).not.toContain("sob encomenda")
    expect(mail.text).toContain("código de rastreio")
  })

  it("despacho leva o código e o link de rastreio", () => {
    const mail = renderTemplate("order_shipped", { ...base, tracking_code: "AB123BR", tracking_url: "https://rastreio.test/AB123BR" })
    expect(mail.html).toContain("AB123BR")
    expect(mail.html).toContain('href="https://rastreio.test/AB123BR"')
  })

  it("nota fiscal cita o número e o anexo", () => {
    const mail = renderTemplate("order_invoice", { ...base, invoice_number: "1234" })
    expect(mail.subject).toBe("Nota fiscal do pedido #42")
    expect(mail.html).toContain("nº 1234")
  })

  it("entrega e demais e-mails de pedido não pedem para responder para sair da lista", () => {
    expect(renderTemplate("order_delivered", base).html).not.toContain("responder esta mensagem")
  })
})

describe("cancelar inscrição nos e-mails de lista", () => {
  const url = "https://tyer.test/sair-da-lista?e=ana%40tyer.test&t=abc"
  it("boas-vindas e ingresso trazem o link e o texto sem HTML", () => {
    for (const template of ["lead_welcome", "ticket"]) {
      const mail = renderTemplate(template, { ...data, unsubscribe_url: url, whatsapp_url: "https://wa.test", login_url: "https://tyer.test/x", drop_title: "Red Rose" })
      expect(mail.html).toContain(`href="${url.replace(/&/g, "&amp;")}"`)
      expect(mail.text).toContain(url)
      expect(mail.text).not.toContain("<a ")
    }
  })
})
