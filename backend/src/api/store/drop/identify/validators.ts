import { z } from "@medusajs/framework/zod"

export const IdentifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

export type IdentifyBody = z.infer<typeof IdentifySchema>
