import { unsubscribeUrl } from "../lead/unsubscribe"
import { randomBytes } from "crypto"
import { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../drop"
import DropModuleService from "../drop/service"
import { resolveDropPhase } from "../drop/phase"
import { LEAD_MODULE } from "../lead"
import LeadModuleService from "../lead/service"
import { readTestMode } from "../notification-smtp/test-mode"
import { ensureAccount } from "../lead/account"
import { TICKET_MODULE } from "./index"
import TicketModuleService from "./service"
import { leadsToIssue, ticketsToSend } from "./eligibility"

const sentInTest = new Set<string>()

const newCode = () => randomBytes(9).toString("base64url")

async function load(scope: MedusaContainer, dropId: string) {
  const drops = scope.resolve<DropModuleService>(DROP_MODULE)
  const leadsService = scope.resolve<LeadModuleService>(LEAD_MODULE)
  const ticketsService = scope.resolve<TicketModuleService>(TICKET_MODULE)

  const drop = await drops.retrieveDrop(dropId)
  const [liberados, tickets] = await Promise.all([
    leadsService.listLeads({ status: "liberado" }, { take: null }),
    ticketsService.listTickets({ drop_id: dropId }, { take: null }),
  ])
  const allLeads = tickets.length
    ? await leadsService.listLeads({ id: tickets.map((t) => t.lead_id) }, { take: null })
    : []
  const leadById = new Map([...liberados, ...allLeads].map((l) => [l.id, l]))
  return { drop, liberados, tickets, leadById, ticketsService }
}

/** O que a emissão faria agora, sem criar nem enviar nada. */
export async function previewTickets(scope: MedusaContainer, dropId: string) {
  const { drop, liberados, tickets, leadById } = await load(scope, dropId)
  return {
    drop_id: drop.id,
    phase: resolveDropPhase(drop),
    eligible: leadsToIssue(liberados, tickets).map((l) => ({ id: l.id, email: l.email, name: l.name })),
    tickets: tickets.map((t) => ({
      id: t.id,
      code: t.code,
      source: t.source,
      sent_at: t.sent_at,
      email: leadById.get(t.lead_id)?.email ?? null,
    })),
    unsent: ticketsToSend(tickets).length,
  }
}

/** Cria os ingressos que faltam e envia o e-mail de todos que ainda não receberam (ou só de `onlyLeadId`). */
export async function issueTickets(scope: MedusaContainer, dropId: string, onlyLeadId?: string) {
  const { drop, liberados, tickets, leadById, ticketsService } = await load(scope, dropId)

  if (resolveDropPhase(drop) === "ended") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Este drop já encerrou")
  }

  const toCreate = leadsToIssue(liberados, tickets).filter((l) => !onlyLeadId || l.id === onlyLeadId)
  const created = toCreate.length
    ? await ticketsService.createTickets(
        toCreate.map((l) => ({
          drop_id: dropId,
          lead_id: l.id,
          customer_id: l.customer_id,
          code: newCode(),
          source: "liberado" as const,
        }))
      )
    : []
  created.forEach((t, i) => leadById.set(toCreate[i].id, toCreate[i]))

  const pending = ticketsToSend([...tickets, ...created]).filter((t) => !onlyLeadId || t.lead_id === onlyLeadId)
  const notifications = scope.resolve(Modules.NOTIFICATION) as any
  const siteUrl = (process.env.SITE_URL || "http://localhost:4321").replace(/\/$/, "")

  let sent = 0
  const failed: { email: string; error: string }[] = []
  const leadsService = scope.resolve<LeadModuleService>(LEAD_MODULE)
  // Em modo de teste o e-mail vai para o endereço de teste e o ingresso NÃO é marcado como enviado: ao desligar
  // o modo, os convidados ainda recebem. Cada ingresso vai ao teste uma vez por execução do servidor.
  const testMode = readTestMode(process.env).enabled
  for (const ticket of pending) {
    if (testMode && sentInTest.has(ticket.id)) continue
    // O status pode ter mudado desde o carregamento (ex.: admin negou o lead): relê antes de enviar.
    const lead = leadById.get(ticket.lead_id) && (await leadsService.retrieveLead(ticket.lead_id).catch(() => null))
    if (!lead || lead.status === "negado" || lead.status === "descadastrado") continue
    try {
      await ensureAccount(scope, lead.email, lead.name)
      await notifications.createNotifications({
        to: lead.email,
        channel: "email",
        template: "ticket",
        data: {
          email: lead.email,
          name: lead.name,
          drop_title: drop.title,
          unsubscribe_url: unsubscribeUrl(lead.email),
          login_url: `${siteUrl}/drop/entrar?c=${encodeURIComponent(ticket.code)}`,
          presale_ends_at: drop.general_starts_at ?? drop.preorder_ends_at,
          production_days: drop.production_days,
        },
      })
    } catch (e: any) {
      failed.push({ email: lead.email, error: e?.message ?? "falha no envio" })
      continue
    }

    if (testMode) {
      sentInTest.add(ticket.id)
      sent++
      continue
    }

    // O e-mail já saiu: se não der para registrar, para tudo em vez de arriscar reenviar a todos na próxima emissão.
    try {
      await ticketsService.updateTickets({ id: ticket.id, sent_at: new Date() })
      sent++
    } catch (e: any) {
      failed.push({ email: lead.email, error: `enviado, mas não foi possível registrar: ${e?.message}` })
      break
    }
  }

  return { created: created.length, sent, failed }
}
