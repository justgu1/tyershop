/** Só um pagamento aprovado vira pedido: pendente espera; recusado, cancelado e vencido não. */
export const shouldComplete = (mpStatus?: string | null) => mpStatus === "approved"
