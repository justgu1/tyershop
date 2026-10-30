import { MedusaContainer } from "@medusajs/framework/types"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"

/** O ingresso é preso ao e-mail da conta: quem entra com esse e-mail já tem acesso à pré-venda. */
export async function hasTicket(scope: MedusaContainer, dropId: string, email?: string | null) {
  if (!email) return false
  const leads = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const tickets = scope.resolve<TicketModuleService>(TICKET_MODULE)

  const [lead] = await leads.listLeads({ email: email.trim().toLowerCase() }, { take: 1 })
  if (!lead || lead.status === "negado") return false

  const [ticket] = await tickets.listTickets({ drop_id: dropId, lead_id: lead.id }, { take: 1 })
  return !!ticket
}
