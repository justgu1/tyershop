import { webhookActionFor } from "../webhook-action"

describe("webhook do Mercado Pago", () => {
  it("pagamento aprovado não conclui o carrinho: quem conclui é o checkout e a conciliação, sob a mesma trava", () => {
    expect(webhookActionFor("approved")).toBe("not_supported")
    expect(webhookActionFor("authorized")).toBe("not_supported")
  })

  it("recusado ou cancelado segue marcando a sessão como falha", () => {
    expect(webhookActionFor("rejected")).toBe("failed")
    expect(webhookActionFor("cancelled")).toBe("failed")
  })
})
