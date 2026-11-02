import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { LEAD_MODULE } from "../../../../modules/lead"
import LeadModuleService from "../../../../modules/lead/service"
import { validUnsubscribeToken } from "../../../../modules/lead/unsubscribe"

const Body = z.object({ email: z.string().trim().toLowerCase().email(), token: z.string().min(1).max(64) })

/**
 * Tira o e-mail da lista do link do e-mail. Quem foi negado continua negado; quem não está na lista recebe a mesma
 * resposta (não revela quem está). O cliente de e-mail também chama este caminho (clique único) pela página do site.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Body.safeParse(req.body)
  if (!parsed.success || !validUnsubscribeToken(parsed.data.email, parsed.data.token)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Link inválido ou incompleto.")
  }
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const [lead] = await leads.listLeads({ email: parsed.data.email }, { take: 1 })
  if (lead && lead.status !== "negado" && lead.status !== "descadastrado") {
    await leads.updateLeads({ id: lead.id, status: "descadastrado" })
  }
  res.json({ ok: true })
}
