import { MedusaContainer } from "@medusajs/framework/types"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"

/**
 * Só vale o ingresso resgatado pelo link enviado ao e-mail do convidado, preso à conta que o resgatou.
 * Criar uma conta com o e-mail de alguém não dá acesso: sem o resgate não há `redeemed_at`.
 */
export async function hasTicket(scope: MedusaContainer, dropId: string, customerId?: string | null) {
  if (!customerId) return false
  const tickets = scope.resolve<TicketModuleService>(TICKET_MODULE)
  const [ticket] = await tickets.listTickets({ drop_id: dropId, customer_id: customerId }, { take: 1 })
  if (!ticket?.redeemed_at) return false

  const lead = await scope.resolve<LeadModuleService>(LEAD_MODULE).retrieveLead(ticket.lead_id)
  // "descadastrado" só interrompe os avisos: quem já tem ingresso resgatado mantém o acesso à pré-venda.
  return lead.status !== "negado"
}
