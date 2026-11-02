import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../../modules/lead"
import LeadModuleService from "../../../../modules/lead/service"
import { UpdateLeadBody } from "../validators"

export async function POST(req: MedusaRequest<UpdateLeadBody>, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const body = req.validatedBody

  // Reativar manualmente zera a contagem de drops sem compra.
  const reset = body.status === "liberado" ? { missed_drops: 0 } : {}
  const lead = await leads.updateLeads({ id: req.params.id, ...body, ...reset })
  res.json({ lead })
}

export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  await leads.deleteLeads(req.params.id)
  res.json({ id: req.params.id, deleted: true })
}
