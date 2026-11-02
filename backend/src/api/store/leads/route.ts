import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"
import LeadModuleService from "../../../modules/lead/service"
import { Modules } from "@medusajs/framework/utils"
import { DROP_MODULE } from "../../../modules/drop"
import { ensureAccount } from "../../../modules/lead/account"
import { resolveDropPhase } from "../../../modules/drop/phase"
import { statusOnCapture } from "../../../modules/lead/status"
import { unsubscribeUrl } from "../../../modules/lead/unsubscribe"
import { StoreCreateLeadBody } from "./validators"

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/JI022Gqv3szBEKCcNBMEwN"

/**
 * Captura pública: cria o lead como pendente (ou liberado, se o cronômetro da pré-venda está correndo) e nunca
 * rebaixa quem já existe (um negado continua negado) nem revela o status de ninguém na resposta.
 */
export async function POST(req: MedusaRequest<StoreCreateLeadBody>, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const { email, name, source } = req.validatedBody

  const drops = req.scope.resolve(DROP_MODULE) as any
  const current = await drops.retrieveCurrent?.()
  const phase = current ? resolveDropPhase(current) : null

  const [existing] = await leads.listLeads({ email }, { take: 1 })
  const isNew = !existing || existing.status === "descadastrado"
  if (isNew) {
    await leads.createLeads({ email, name: name ?? null, status: statusOnCapture(null, phase), source })
  } else if (existing.status === "descadastrado" || existing.status === "pendente") {
    const next = statusOnCapture(existing.status, phase)
    if (next !== existing.status) await leads.updateLeads({ id: existing.id, status: next })
  }
  if (existing?.status !== "negado") {
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
  res.status(201).json({ ok: true })
}
