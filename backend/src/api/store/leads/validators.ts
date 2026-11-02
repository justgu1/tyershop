import { z } from "@medusajs/framework/zod"

export const StoreCreateLeadSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(120).nullable().optional(),
  source: z.enum(["popup", "presave", "pedir_acesso", "avise_me", "signup"]).default("popup"),
})

export type StoreCreateLeadBody = z.infer<typeof StoreCreateLeadSchema>
