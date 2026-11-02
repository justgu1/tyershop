import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../../modules/lead"
import LeadModuleService from "../../../../modules/lead/service"
import { IdentifyBody } from "./validators"

/**
 * Passo único do formulário de acesso: registra quem é novo como lead pendente e responde sempre igual,
 * sem revelar se o e-mail já tem conta. Não cria conta (isso só acontece no cadastro da lista e na emissão do ingresso).
 */
export async function POST(req: MedusaRequest<IdentifyBody>, res: MedusaResponse) {
  const { email } = req.validatedBody
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const [lead] = await leads.listLeads({ email }, { take: 1 })
  if (!lead) await leads.createLeads({ email, name: null, source: "pedir_acesso", status: "pendente" })

  res.json({ exists: true })
}
