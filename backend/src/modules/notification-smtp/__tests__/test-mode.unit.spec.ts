import { applyTestModeNote, envelopeFor, isUndeliverable, readTestMode, resolveRecipient } from "../test-mode"

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

describe("applyTestModeNote", () => {
  const mail = { html: "<!doctype html><html><body class=\"x\"><div>preheader</div><p>oi</p></BODY></html>", text: "oi" }

  it("sem redirecionamento não muda nada", () => {
    expect(applyTestModeNote(mail)).toEqual(mail)
  })

  it("põe o aviso no fim do corpo, depois do texto de pré-visualização", () => {
    const r = applyTestModeNote(mail, "cliente@x.com")
    expect(r.html.indexOf("preheader")).toBeLessThan(r.html.indexOf("Modo de teste"))
    expect(r.html).toMatch(/Modo de teste: este e-mail seria enviado para cliente@x\.com\.<\/div><\/BODY>/)
    expect(r.text.endsWith("seria enviado para cliente@x.com.")).toBe(true)
  })

  it("sem tag de corpo, o aviso vai no fim e o endereço é escapado", () => {
    const r = applyTestModeNote({ html: "<p>oi</p>", text: "oi" }, "a<b>@x.com")
    expect(r.html.startsWith("<p>oi</p><div")).toBe(true)
    expect(r.html).not.toContain("<b>")
  })
})

describe("envelopeFor", () => {
  const cfg = { enabled: true, to: "eu@teste.com" }
  it("redefinição de senha vai ao destinatário real, sem redirecionamento", () => {
    expect(envelopeFor("password_reset", "cliente@x.com", "Senha", cfg)).toEqual({ to: "cliente@x.com", subject: "Senha" })
  })
  it("os demais seguem o modo de teste", () => {
    expect(envelopeFor("ticket", "cliente@x.com", "Ingresso", cfg)).toMatchObject({ to: "eu@teste.com", redirectedFrom: "cliente@x.com" })
  })
})
