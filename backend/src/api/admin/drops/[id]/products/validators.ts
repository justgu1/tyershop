import { z } from "@medusajs/framework/zod"

export const SetDropProductsSchema = z.object({ product_ids: z.array(z.string()) })
export type SetDropProductsBody = z.infer<typeof SetDropProductsSchema>
