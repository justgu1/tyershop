import { z } from "@medusajs/framework/zod"

export const RedeemTicketSchema = z.object({ code: z.string().trim().min(6).max(64) })
export type RedeemTicketBody = z.infer<typeof RedeemTicketSchema>
