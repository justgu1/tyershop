import { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, generateJwtToken } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../drop"
import DropModuleService from "../drop/service"
import { resolveDropPhase } from "../drop/phase"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { ensureAccount } from "../lead/account"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"

/** Depois do primeiro uso o link ainda funciona por alguns minutos (recarregar, trocar de aba); depois disso só a senha entra. */
const REUSE_WINDOW_MS = 10 * 60 * 1000

const invalid = () => new MedusaError(MedusaError.Types.NOT_FOUND, "Convite inválido ou expirado")

/**
 * Troca o código do ingresso (link do e-mail) por um token de sessão da conta
 * do convidado, criando a conta se ainda não existir. Quem foi barrado, ou um
 * drop encerrado, não resgata.
 */
export async function redeemTicket(scope: MedusaContainer, code: string) {
  const tickets = scope.resolve<TicketModuleService>(TICKET_MODULE)
  const [ticket] = await tickets.listTickets({ code }, { take: 1 })
  if (!ticket) throw invalid()
  if (ticket.redeemed_at && Date.now() - new Date(ticket.redeemed_at).getTime() > REUSE_WINDOW_MS) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Esse link já foi usado. Entre com a sua senha ou use “esqueci minha senha” para criar uma."
    )
  }

  const drop = await scope.resolve<DropModuleService>(DROP_MODULE).retrieveDrop(ticket.drop_id)
  if (resolveDropPhase(drop) === "ended") throw invalid()

  const leads = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const lead = await leads.retrieveLead(ticket.lead_id)
  if (lead.status === "negado") throw invalid()

  let customer, authIdentity
  try {
    ;({ customer, authIdentity } = await ensureAccount(scope, lead.email, lead.name))
  } catch {
    throw invalid()
  }

  const http = (scope.resolve("configModule") as any).projectConfig.http
  const token = generateJwtToken(
    {
      actor_id: customer.id,
      actor_type: "customer",
      auth_identity_id: authIdentity.id,
      app_metadata: { customer_id: customer.id, roles: [] },
      user_metadata: {},
    },
    { secret: http.jwtSecret, expiresIn: http.jwtExpiresIn ?? "1d", jwtOptions: http.jwtOptions }
  )

  await tickets.updateTickets({ id: ticket.id, customer_id: customer.id, redeemed_at: ticket.redeemed_at ?? new Date() })
  if (lead.customer_id !== customer.id) await leads.updateLeads({ id: lead.id, customer_id: customer.id })

  return { token, drop_handle: drop.handle }
}
