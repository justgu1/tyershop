import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"
import LeadModuleService from "../../../modules/lead/service"
import { StoreCreateLeadBody } from "./validators"

/**
 * Captura pública: cria o lead como pendente e nunca altera quem já existe
 * (um negado continua negado) nem revela o status de ninguém na resposta.
 */
export async function POST(req: MedusaRequest<StoreCreateLeadBody>, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const { email, name, source } = req.validatedBody

  const [existing] = await leads.listLeads({ email }, { take: 1 })
  if (!existing) {
    await leads.createLeads({ email, name: name ?? null, source, status: "pendente" })
  }
  res.status(201).json({ ok: true })
}
