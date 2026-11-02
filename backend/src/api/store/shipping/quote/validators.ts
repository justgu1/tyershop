import { z } from "@medusajs/framework/zod"

export const StoreQuoteSchema = z.object({
  postal_code: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  items: z
    .array(z.object({ variant_id: z.string().min(1).max(64), quantity: z.number().int().min(1).max(50) }))
    .min(1)
    .max(30),
})

export type StoreQuoteBody = z.infer<typeof StoreQuoteSchema>
