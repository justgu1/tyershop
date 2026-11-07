export type WebhookAction = "failed" | "not_supported"

/**
 * Aprovado não vira ação: quem conclui o carrinho é o checkout (depois do status) e a conciliação, sempre sob a mesma
 * trava. Se o webhook concluísse também, as execuções em paralelo derrubavam umas às outras e reembolsavam o Pix.
 */
export function webhookActionFor(mpStatus: string): WebhookAction {
  return mpStatus === "rejected" || mpStatus === "cancelled" ? "failed" : "not_supported"
}
