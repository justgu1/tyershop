import { z } from "@medusajs/framework/zod"
import { LEAD_STATUSES } from "../../../modules/lead/models/lead"

export const CreateLeadSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().nullable().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.string().trim().optional(),
})

export const UpdateLeadSchema = z.object({
  name: z.string().trim().nullable().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
})

export type CreateLeadBody = z.infer<typeof CreateLeadSchema>
export type UpdateLeadBody = z.infer<typeof UpdateLeadSchema>
