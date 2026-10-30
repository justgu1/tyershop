type LeadLike = { id: string; status: string }
type TicketLike = { lead_id: string; sent_at?: Date | string | null }

/** Liberados ainda sem ingresso neste drop. Inativos, pendentes e negados não recebem convite automático. */
export function leadsToIssue<L extends LeadLike>(leads: L[], tickets: TicketLike[]): L[] {
  const withTicket = new Set(tickets.map((t) => t.lead_id))
  return leads.filter((l) => l.status === "liberado" && !withTicket.has(l.id))
}

/** Ingressos já criados cujo e-mail ainda não saiu (permite reenviar sem duplicar). */
export function ticketsToSend<T extends TicketLike>(tickets: T[]): T[] {
  return tickets.filter((t) => !t.sent_at)
}
