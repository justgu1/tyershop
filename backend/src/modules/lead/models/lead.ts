import { model } from "@medusajs/framework/utils"

export const LEAD_STATUSES = ["pendente", "liberado", "inativo", "negado", "descadastrado"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

const Lead = model.define("lead", {
  id: model.id({ prefix: "lead" }).primaryKey(),
  email: model.text().unique(),
  name: model.text().nullable(),
  status: model.enum([...LEAD_STATUSES]).default("pendente"),
  source: model.text().default("manual"),
  customer_id: model.text().nullable(),
  missed_drops: model.number().default(0),
})

export default Lead
