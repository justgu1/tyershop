import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"
import LeadModuleService from "../../../modules/lead/service"
import { Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../../../modules/drop"
import { ensureAccount } from "../../../modules/lead/account"
import { resolveDropPhase } from "../../../modules/drop/phase"
import { statusOnCapture } from "../../../modules/lead/status"
import { issueTickets } from "../../../modules/ticket/issue"
import { unsubscribeUrl } from "../../../modules/lead/unsubscribe"
import { StoreCreateLeadBody } from "./validators"

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/JI022Gqv3szBEKCcNBMEwN"

/**
 * Captura pública: cria o lead como pendente (ou liberado, se o cronômetro da pré-venda está correndo ou se a pré-venda
 * já abriu em um drop que libera quem se cadastra nela) e nunca
 * rebaixa quem já existe (um negado continua negado) nem revela o status de ninguém na resposta.
 */
export async function POST(req: MedusaRequest<StoreCreateLeadBody>, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const { email, name, source } = req.validatedBody

  // O drop só decide o status inicial e o texto do e-mail: sem ele (módulo fora do ar, data inválida) o cadastro segue como pendente.
  let current: any = null
  let phase: ReturnType<typeof resolveDropPhase> | null = null
  try {
    current = await (req.scope.resolve(DROP_MODULE) as any).retrieveCurrent?.()
    phase = current ? resolveDropPhase(current) : null
  } catch (err) {
    req.scope.resolve("logger").warn(`drop atual indisponível no cadastro: ${(err as Error).message}`)
  }

  const releaseInPresale = !!current?.release_leads_in_presale
  const [existing] = await leads.listLeads({ email }, { take: 1 })
  const isNew = !existing
  let releasedInPresale: string | null = null
  if (isNew) {
    const status = statusOnCapture(null, phase, releaseInPresale)
    const created = await leads.createLeads({ email, name: name ?? null, status, source })
    if (status === "liberado" && phase === "presale") releasedInPresale = created.id
  } else if (existing.status === "pendente") {
    const next = statusOnCapture(existing.status, phase, releaseInPresale)
    if (next !== existing.status) await leads.updateLeads({ id: existing.id, status: next })
    if (next === "liberado" && phase === "presale") releasedInPresale = existing.id
  }
  // Quem saiu da lista (ou foi negado) não é reativado nem recebe e-mail por um cadastro público: qualquer um poderia
  // reinscrever o endereço de outra pessoa. Voltar é decisão do admin.
  if (existing?.status !== "negado" && existing?.status !== "descadastrado") {
    try {
      await ensureAccount(req.scope, email, name)
    } catch (err) {
      req.scope.resolve("logger").warn(`conta do lead não criada: ${(err as Error).message}`)
    }
  }

  // Só o primeiro cadastro recebe e-mail (reenviar a cada envio serviria de spam contra qualquer endereço).
  // A resposta é igual para todos, para não revelar quem já está na lista nem o status.
  if (isNew) {
    try {
      await req.scope.resolve(Modules.NOTIFICATION).createNotifications({
        to: email,
        channel: "email",
        template: "lead_welcome",
        data: {
          email,
          drop_title: current?.title ?? null,
          unsubscribe_url: unsubscribeUrl(email),
          whatsapp_url: current?.whatsapp_url || WHATSAPP_GROUP_URL,
        },
      })
    } catch (err) {
      req.scope.resolve("logger").warn(`lead_welcome não enviado: ${(err as Error).message}`)
    }
  }
  // Com a pré-venda aberta ninguém espera a próxima emissão em lote: quem acabou de ser liberado recebe o ingresso agora.
  if (releasedInPresale && current) {
    try {
      await issueTickets(req.scope, current.id, releasedInPresale)
    } catch (err) {
      req.scope.resolve("logger").warn(`ingresso do lead não emitido: ${(err as Error).message}`)
    }
  }
  res.status(201).json({ ok: true })
}
