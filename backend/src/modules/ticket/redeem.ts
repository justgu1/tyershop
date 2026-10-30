import { randomBytes } from "crypto"
import { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules, generateJwtToken } from "@medusajs/framework/utils"
import { createCustomersWorkflow } from "@medusajs/medusa/core-flows"
import { DROP_MODULE } from "../drop"
import DropModuleService from "../drop/service"
import { resolveDropPhase } from "../drop/phase"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"

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

  const drop = await scope.resolve<DropModuleService>(DROP_MODULE).retrieveDrop(ticket.drop_id)
  if (resolveDropPhase(drop) === "ended") throw invalid()

  const leads = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const lead = await leads.retrieveLead(ticket.lead_id)
  if (lead.status === "negado") throw invalid()

  const customerModule = scope.resolve(Modules.CUSTOMER) as any
  const authModule = scope.resolve(Modules.AUTH) as any

  let [customer] = await customerModule.listCustomers({ email: lead.email }, { take: 1 })
  if (!customer) {
    const { result } = await createCustomersWorkflow(scope).run({
      input: {
        customersData: [{ email: lead.email, first_name: lead.name?.split(" ")[0] ?? undefined, has_account: true }],
      },
    })
    customer = result[0]
  } else if (!customer.has_account) {
    customer = await customerModule.updateCustomers(customer.id, { has_account: true })
  }

  const [existing] = await authModule.listAuthIdentities(
    { provider_identities: { entity_id: lead.email, provider: "emailpass" } },
    { relations: ["provider_identities"], take: 1 }
  )

  let authIdentity = existing
  if (!authIdentity) {
    // Conta criada pelo convite: senha aleatória; a pessoa define a sua pelo "esqueci minha senha".
    const registered = await authModule.register("emailpass", {
      body: { email: lead.email, password: randomBytes(24).toString("hex") },
      url: "",
      headers: {},
      query: {},
      protocol: "",
    })
    if (!registered.success) throw invalid()
    authIdentity = registered.authIdentity
  }

  if (authIdentity.app_metadata?.customer_id !== customer.id) {
    authIdentity = await authModule.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { customer_id: customer.id },
    })
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

  if (ticket.customer_id !== customer.id) await tickets.updateTickets({ id: ticket.id, customer_id: customer.id })
  if (lead.customer_id !== customer.id) await leads.updateLeads({ id: lead.id, customer_id: customer.id })

  return { token, drop_handle: drop.handle }
}
