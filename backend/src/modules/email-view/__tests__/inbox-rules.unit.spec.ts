import { classifyInbox, plainTextOf } from "../inbox-rules"

const D = "tyershop.com"
const at = (from: string, subject: string, autoSubmitted?: string) => classifyInbox({ from, subject, autoSubmitted }, D)

describe("caixa de suporte", () => {
  it("cada tipo de e-mail vai para a sua pasta", () => {
    expect(at("MAILER-DAEMON@mailchannels.net", "Undelivered Mail Returned to Sender").folder).toBe("Devolvidos")
    expect(at("suporte@tyershop.com", "Pedido #1293 confirmado").folder).toBe("Copias - Pedidos")
    expect(at("suporte@tyershop.com", "Estorno do pedido #1238").folder).toBe("Copias - Pedidos")
    expect(at("suporte@tyershop.com", "Você está na lista do drop Drop 6").folder).toBe("Copias - Drop")
    expect(at("suporte@tyershop.com", "Seu ingresso para o drop Red Rose").folder).toBe("Copias - Drop")
    expect(at("suporte@tyershop.com", "Qualquer outro").folder).toBe("Copias - Outros")
    expect(at("team@email.hostinger.com", "Get started").folder).toBe("Outros")
  })

  it("só resposta de cliente é encaminhada, nunca cópia nossa, devolução ou resposta automática", () => {
    expect(at("cliente@gmail.com", "Re: Pedido #1238 confirmado")).toEqual({ folder: "Respostas de clientes", customerReply: true })
    for (const m of [at("suporte@tyershop.com", "Pedido #1 confirmado"), at("MAILER-DAEMON@x.net", "Undelivered Mail Returned to Sender"), at("cliente@gmail.com", "Fora do escritório", "auto-replied"), at("no-reply@x.com", "Aviso")]) {
      expect(m.customerReply).toBe(false)
    }
  })

  it("lê o texto da resposta em quoted-printable, base64 e multipart", () => {
    const qp = "From: a@b.com\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nOl=C3=A1, meu pedido est=C3=A1 cancelado?"
    expect(plainTextOf(qp)).toBe("Olá, meu pedido está cancelado?")
    const multi = `Content-Type: multipart/alternative; boundary="XX"\r\n\r\n--XX\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from("Bom dia!").toString("base64")}\r\n--XX\r\nContent-Type: text/html\r\n\r\n<p>Bom dia!</p>\r\n--XX--`
    expect(plainTextOf(multi)).toBe("Bom dia!")
  })
})
