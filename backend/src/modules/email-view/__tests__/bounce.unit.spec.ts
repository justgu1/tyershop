import { parseBounce } from "../bounce"

const dsn = (status: string, diagnostic: string, action = "failed") => `Return-Path: <>
From: MAILER-DAEMON@mailchannels.net (Mail Delivery System)
Subject: Undelivered Mail Returned to Sender
Message-Id: <20261111034514.2AF1A800A14@relay.mailchannels.net>

This is the mail system at host relay.mailchannels.net.

Reporting-MTA: dns; relay.mailchannels.net
Arrival-Date: Tue, 10 Nov 2026 21:03:17 +0000 (UTC)

Final-Recipient: rfc822; Cliente@Gmail.com
Original-Recipient: rfc822;cliente@gmail.com
Action: ${action}
Status: ${status}
Remote-MTA: dns; alt1.gmail-smtp-in.l.google.com
Diagnostic-Code: smtp; ${diagnostic.split("\n")[0]}
${diagnostic
  .split("\n")
  .slice(1)
  .map((l) => ` ${l}`)
  .join("\n")}

Content-Description: Undelivered Message
Subject: Pedido #1293 confirmado
Message-ID: <10eadadf-bad6-0985-c770-5d74048a913d@tyershop.com>
Date: Tue, 10 Nov 2026 21:03:12 +0000
`

describe("relatório de devolução", () => {
  it("caixa cheia do Gmail aponta o Message-ID do nosso e-mail, o destinatário e o motivo", () => {
    const b = parseBounce(dsn("4.2.2", "452-4.2.2 The recipient's inbox is out of storage space.\nPlease direct the recipient to https://support.google.com/mail/?p=OverQuotaTemp"), "tyershop.com")
    expect(b).toMatchObject({ messageId: "<10eadadf-bad6-0985-c770-5d74048a913d@tyershop.com>", recipient: "cliente@gmail.com", status: "4.2.2", reason: "caixa_cheia" })
    expect(b!.diagnostic).toContain("out of storage space. Please direct")
  })

  it("endereço que não existe e recusa genérica têm motivos próprios", () => {
    expect(parseBounce(dsn("5.1.1", "550 5.1.1 The email account does not exist"), "tyershop.com")!.reason).toBe("endereco_inexistente")
    expect(parseBounce(dsn("5.7.1", "550 blocked"), "tyershop.com")!.reason).toBe("recusado")
    expect(parseBounce(dsn("5.2.2", "552 5.2.2 user is over quota"), "tyershop.com")!.reason).toBe("caixa_cheia")
  })

  it("aviso de atraso não conta como devolução", () => {
    expect(parseBounce(dsn("4.4.1", "connection timed out", "delayed"), "tyershop.com")).toBeNull()
  })

  it("devolução de e-mail de outro domínio é ignorada", () => {
    expect(parseBounce(dsn("4.2.2", "452 full"), "outro.com")).toBeNull()
  })
})
