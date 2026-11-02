import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../../modules/lead"
import { ensureAccount } from "../../../../modules/lead/account"
import LeadModuleService from "../../../../modules/lead/service"
import { IdentifyBody } from "./validators"

/**
 * Passo único do formulário de acesso: diz se já existe conta (pede a senha) ou
 * não (pede para criar uma) e registra quem é novo como lead pendente.
 */
export async function POST(req: MedusaRequest<IdentifyBody>, res: MedusaResponse) {
  const { email } = req.validatedBody
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const [lead] = await leads.listLeads({ email }, { take: 1 })
  if (!lead) await leads.createLeads({ email, name: null, source: "pedir_acesso", status: "pendente" })

  // Toda conta nasce com senha aleatória: quem não sabe a senha usa o link do ingresso ou "esqueci minha senha".
  if (lead?.status !== "negado") await ensureAccount(req.scope, email)
  res.json({ exists: true })
}
