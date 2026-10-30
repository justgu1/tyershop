import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { LEAD_MODULE } from "../../../modules/lead"
import LeadModuleService from "../../../modules/lead/service"
import { LEAD_STATUSES } from "../../../modules/lead/models/lead"
import { CreateLeadBody } from "./validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const { status, q } = req.query as { status?: string; q?: string }

  const filters: Record<string, unknown> = {}
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) filters.status = status
  if (q) filters.email = { $ilike: `%${q}%` }

  const [list, count] = await leads.listAndCountLeads(filters, {
    order: { created_at: "DESC" },
    take: Math.min(Number(req.query.limit) || 100, 500),
    skip: Number(req.query.offset) || 0,
  })
  res.json({ leads: list, count })
}

export async function POST(req: MedusaRequest<CreateLeadBody>, res: MedusaResponse) {
  const leads = req.scope.resolve<LeadModuleService>(LEAD_MODULE)
  const { email, name, status, source } = req.validatedBody

  const [existing] = await leads.listLeads({ email }, { take: 1 })
  if (existing) {
    return res.status(409).json({ message: "Já existe um lead com esse e-mail", lead: existing })
  }

  const lead = await leads.createLeads({
    email,
    name: name ?? null,
    status: status ?? "liberado",
    source: source ?? "manual",
  })
  res.status(201).json({ lead })
}
