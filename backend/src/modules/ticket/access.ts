import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"

/** Login criado por nós para um lead, ou de um usuário do admin: ninguém pré-registrou esse e-mail com senha própria. */
export const isTrustedIdentity = (appMetadata?: Record<string, unknown> | null) => !!(appMetadata?.lead_account || appMetadata?.user_id)

/**
 * Vale o ingresso resgatado pelo link enviado ao e-mail do convidado, preso à conta que o resgatou. Entrar com a senha
 * de um login confiável (ver `isTrustedIdentity`) com o mesmo e-mail do ingresso também resgata: quem sabe a senha
 * é o dono. Criar uma conta qualquer com o e-mail de alguém não dá acesso.
 */
export async function hasTicket(scope: MedusaContainer, dropId: string, customerId?: string | null) {
  if (!customerId) return false
  const tickets = scope.resolve<TicketModuleService>(TICKET_MODULE)
  const leads = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const [ticket] = await tickets.listTickets({ drop_id: dropId, customer_id: customerId }, { take: 1 })

  if (ticket?.redeemed_at) {
    const lead = await leads.retrieveLead(ticket.lead_id)
    // "descadastrado" só interrompe os avisos: quem já tem ingresso resgatado mantém o acesso à pré-venda.
    return lead.status !== "negado"
  }
  return redeemByLogin(scope, dropId, customerId)
}

async function redeemByLogin(scope: MedusaContainer, dropId: string, customerId: string) {
  const tickets = scope.resolve<TicketModuleService>(TICKET_MODULE)
  const leads = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const customer = await (scope.resolve(Modules.CUSTOMER) as any).retrieveCustomer(customerId).catch(() => null)
  if (!customer?.email) return false

  const [lead] = await leads.listLeads({ email: String(customer.email).toLowerCase() }, { take: 1 })
  if (!lead || lead.status === "negado") return false
  const [ticket] = await tickets.listTickets({ drop_id: dropId, lead_id: lead.id }, { take: 1 })
  if (!ticket) return false

  const [identity] = await (scope.resolve(Modules.AUTH) as any).listAuthIdentities(
    { provider_identities: { entity_id: lead.email, provider: "emailpass" } },
    { take: 1 }
  )
  if (!isTrustedIdentity(identity?.app_metadata)) return false

  await tickets.updateTickets({ id: ticket.id, customer_id: customerId, redeemed_at: ticket.redeemed_at ?? new Date() })
  if (lead.customer_id !== customerId) await leads.updateLeads({ id: lead.id, customer_id: customerId })
  return true
}
